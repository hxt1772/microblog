import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { usePostsStore } from '@/stores/usePostsStore'
import { installFakeServer } from '@/test-utils/fakeServer'
import type { FakeServerSeed } from '@/test-utils/fakeServer'
import { mountWithPinia } from '@/test-utils/mount'
import type { Post } from '@/types/post'
import PostFeed from './PostFeed.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

/** 安装 fake server 并挂载列表，随后完成水合。 */
async function mountFeed(seed: readonly FakeServerSeed[] = []) {
  installFakeServer({ now: () => NOW, seed })
  const { wrapper } = mountWithPinia(PostFeed)
  const store = usePostsStore()
  await store.hydrate(NOW)
  await flushPromises()
  return { wrapper, store }
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    content: '今天天气不错',
    createdAt: NOW,
    likes: 0,
    liked: false,
    favorited: false,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 只实现列表与点赞 / 收藏两个端点：互动路由在其它分支并行实现，
 * 这里用内存替身隔离，避免列表用例依赖未合并的后端。
 */
function stubPostsServer(seed: readonly Post[]): void {
  const state = seed.map((post) => ({ ...post }))

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'

    if (method === 'GET') return jsonResponse({ posts: state })

    const match = /^\/api\/posts\/([^/]+)\/(like|favorite)$/.exec(url)
    const index = match ? state.findIndex((post) => post.id === decodeURIComponent(match[1] as string)) : -1
    if (!match || index < 0) {
      return jsonResponse({ error: { code: 'POST_NOT_FOUND', message: '动态不存在' } }, 404)
    }

    const target = state[index] as Post
    const updated: Post =
      match[2] === 'like'
        ? { ...target, liked: !target.liked, likes: target.liked ? target.likes - 1 : target.likes + 1 }
        : { ...target, favorited: !target.favorited }
    state[index] = updated

    return jsonResponse({ post: updated })
  })
}

/** 用内存替身提供带点赞 / 收藏状态的预置数据并完成水合。 */
async function mountFeedWith(posts: readonly Post[]) {
  stubPostsServer(posts)
  const { wrapper } = mountWithPinia(PostFeed)
  const store = usePostsStore()
  await store.hydrate(NOW)
  await flushPromises()
  return { wrapper, store }
}

describe('PostFeed', () => {
  it('水合前展示加载态，水合后消失', async () => {
    installFakeServer()
    const { wrapper } = mountWithPinia(PostFeed)

    expect(wrapper.find('[data-testid="feed-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)

    await usePostsStore().hydrate(NOW)
    await flushPromises()

    expect(wrapper.find('[data-testid="feed-loading"]').exists()).toBe(false)
  })

  it('无内容时展示空状态与 0 条计数', async () => {
    const { wrapper } = await mountFeed()

    expect(wrapper.text()).toContain('还没有内容')
    expect(wrapper.text()).toContain('发布第一条动态，它会保存到服务端。')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('0 条')
    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(0)
  })

  it('按倒序渲染服务端动态并更新计数', async () => {
    const { wrapper } = await mountFeed([
      { content: '较早的动态', createdAt: NOW - 3_600_000 },
      { content: '最新的动态', createdAt: NOW },
    ])

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('最新的动态')
    expect(items[1]?.text()).toContain('较早的动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('2 条')
    expect(wrapper.text()).not.toContain('还没有内容')
  })

  it('新发布的动态立即出现在列表顶部', async () => {
    const { wrapper, store } = await mountFeed([{ content: '旧动态', createdAt: NOW - 3_600_000 }])

    await store.publish('新动态', NOW)
    await flushPromises()

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('新动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('2 条')
  })
})

describe('PostFeed / 全部与收藏切换', () => {
  it('默认停留在全部视图，收藏 tab 展示已收藏条数', async () => {
    const { wrapper } = await mountFeedWith([
      makePost({ id: 'p2', content: '已收藏的动态', favorited: true }),
      makePost({ id: 'p1', content: '未收藏的动态', createdAt: NOW - 60_000 }),
    ])

    const allTab = wrapper.get('[data-testid="feed-tab-all"]')
    const favoriteTab = wrapper.get('[data-testid="feed-tab-favorites"]')
    expect(allTab.element.tagName).toBe('BUTTON')
    expect(allTab.attributes('aria-pressed')).toBe('true')
    expect(favoriteTab.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="favorites-count"]').text()).toBe('1')
    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(2)
  })

  it('切换到收藏后只渲染已收藏项，feed-count 仍表示全部条数', async () => {
    const { wrapper } = await mountFeedWith([
      makePost({ id: 'p2', content: '已收藏的动态', favorited: true }),
      makePost({ id: 'p1', content: '未收藏的动态', createdAt: NOW - 60_000 }),
    ])

    await wrapper.get('[data-testid="feed-tab-favorites"]').trigger('click')

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('已收藏的动态')
    expect(wrapper.get('[data-testid="feed-tab-favorites"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="feed-tab-all"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="feed-count"]').text()).toBe('2 条')
    expect(wrapper.find('[data-testid="favorites-empty"]').exists()).toBe(false)
  })

  it('切回全部后重新渲染全部动态', async () => {
    const { wrapper } = await mountFeedWith([
      makePost({ id: 'p2', content: '已收藏的动态', favorited: true }),
      makePost({ id: 'p1', content: '未收藏的动态', createdAt: NOW - 60_000 }),
    ])

    await wrapper.get('[data-testid="feed-tab-favorites"]').trigger('click')
    await wrapper.get('[data-testid="feed-tab-all"]').trigger('click')

    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="feed-tab-all"]').attributes('aria-pressed')).toBe('true')
  })

  it('没有收藏时展示收藏空态而不是列表', async () => {
    const { wrapper } = await mountFeedWith([
      makePost({ id: 'p1', content: '未收藏的动态' }),
    ])

    await wrapper.get('[data-testid="feed-tab-favorites"]').trigger('click')

    const empty = wrapper.get('[data-testid="favorites-empty"]')
    expect(empty.text()).toContain('还没有收藏内容')
    expect(empty.text()).toContain('在动态上点亮星标即可收藏')
    expect(wrapper.find('[data-testid="timeline"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="favorites-count"]').text()).toBe('0')
  })

  it('在收藏视图取消收藏后该项从列表移除', async () => {
    const { wrapper } = await mountFeedWith([
      makePost({ id: 'p2', content: '已收藏的动态', favorited: true }),
      makePost({ id: 'p1', content: '未收藏的动态', createdAt: NOW - 60_000 }),
    ])

    await wrapper.get('[data-testid="feed-tab-favorites"]').trigger('click')
    await wrapper.get('[data-testid="favorite-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="favorites-empty"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="favorites-count"]').text()).toBe('0')
    expect(wrapper.get('[data-testid="feed-count"]').text()).toBe('2 条')
  })

  it('收藏后无需切换视图即可在收藏 tab 看到新条目', async () => {
    const { wrapper } = await mountFeedWith([makePost({ id: 'p1', content: '未收藏的动态' })])

    await wrapper.get('[data-testid="favorite-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="favorites-count"]').text()).toBe('1')

    await wrapper.get('[data-testid="feed-tab-favorites"]').trigger('click')
    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('未收藏的动态')
  })
})
