import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { usePostsStore } from '@/stores/usePostsStore'
import { useToastStore } from '@/stores/useToastStore'
import { mountWithPinia } from '@/test-utils/mount'
import type { Post } from '@/types/post'
import PostItem from './PostItem.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    content: '今天天气不错',
    createdAt: NOW - 3 * 60 * 1000,
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

/** 用父级把 store 里的记录喂给 PostItem，贴近列表中的真实数据流。 */
const FeedHarness = defineComponent({
  setup() {
    const store = usePostsStore()
    return () => h('ul', store.posts.map((post) => h(PostItem, { key: post.id, post, now: NOW })))
  },
})

describe('PostItem', () => {
  it('展示作者、相对时间与内容', () => {
    const wrapper = mountPostItem(makePost())

    expect(wrapper.text()).toContain('我')
    expect(wrapper.text()).toContain('3 分钟前')
    expect(wrapper.text()).toContain('今天天气不错')
  })

  it('提供机器可读的时间属性', () => {
    const post = makePost()
    const wrapper = mountPostItem(post)

    expect(wrapper.find('time').attributes('datetime')).toBe(new Date(post.createdAt).toISOString())
  })

  it('内容按纯文本渲染，不解析 HTML', () => {
    const wrapper = mountPostItem(makePost({ content: '<b>加粗</b><img src=x onerror="alert(1)">' }))

    expect(wrapper.html()).not.toContain('<b>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<b>加粗</b>')
  })

  it('相对时间跟随 now 属性变化', () => {
    const wrapper = mountPostItem(makePost({ createdAt: NOW - 2 * 60 * 60 * 1000 }))

    expect(wrapper.text()).toContain('今天 13:30')
  })
})

describe('PostItem / 点赞与收藏', () => {
  it('始终展示点赞数，未激活时给出「点赞 / 收藏」语义', () => {
    const wrapper = mountPostItem(makePost({ likes: 7 }))

    const like = wrapper.get('[data-testid="like-button"]')
    expect(like.attributes('type')).toBe('button')
    expect(like.attributes('aria-pressed')).toBe('false')
    expect(like.attributes('aria-label')).toBe('点赞')
    expect(like.classes()).not.toContain('is-active')
    expect(wrapper.get('[data-testid="like-count"]').text()).toBe('7')

    const favorite = wrapper.get('[data-testid="favorite-button"]')
    expect(favorite.attributes('type')).toBe('button')
    expect(favorite.attributes('aria-pressed')).toBe('false')
    expect(favorite.attributes('aria-label')).toBe('收藏')
    expect(favorite.classes()).not.toContain('is-active')
  })

  it('已点赞已收藏时按钮呈激活态并给出取消语义', () => {
    const wrapper = mountPostItem(makePost({ likes: 2, liked: true, favorited: true }))

    const like = wrapper.get('[data-testid="like-button"]')
    expect(like.attributes('aria-pressed')).toBe('true')
    expect(like.attributes('aria-label')).toBe('取消点赞')
    expect(like.classes()).toContain('is-active')

    const favorite = wrapper.get('[data-testid="favorite-button"]')
    expect(favorite.attributes('aria-pressed')).toBe('true')
    expect(favorite.attributes('aria-label')).toBe('取消收藏')
    expect(favorite.classes()).toContain('is-active')
  })

  it('图标对辅助技术隐藏', () => {
    const wrapper = mountPostItem(makePost())

    for (const svg of wrapper.findAll('svg')) {
      expect(svg.attributes('aria-hidden')).toBe('true')
    }
  })

  it('点击点赞后按服务端返回的记录更新计数与状态', async () => {
    const post = makePost({ likes: 7 })
    vi.stubGlobal('fetch', () =>
      Promise.resolve(jsonResponse({ post: { ...post, likes: 8, liked: true } })),
    )
    const { wrapper } = mountWithPinia(FeedHarness)
    usePostsStore().posts = [post]
    await flushPromises()

    await wrapper.get('[data-testid="like-button"]').trigger('click')
    await flushPromises()

    const like = wrapper.get('[data-testid="like-button"]')
    expect(wrapper.get('[data-testid="like-count"]').text()).toBe('8')
    expect(like.attributes('aria-pressed')).toBe('true')
    expect(like.attributes('aria-label')).toBe('取消点赞')
    expect(like.classes()).toContain('is-active')
  })

  it('点击收藏后按服务端返回的记录切换收藏态', async () => {
    const post = makePost()
    vi.stubGlobal('fetch', () =>
      Promise.resolve(jsonResponse({ post: { ...post, favorited: true } })),
    )
    const { wrapper } = mountWithPinia(FeedHarness)
    const store = usePostsStore()
    store.posts = [post]
    await flushPromises()

    await wrapper.get('[data-testid="favorite-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="favorite-button"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="favorite-button"]').classes()).toContain('is-active')
    expect(store.favoriteCount).toBe(1)
  })

  it('请求飞行中时两个按钮同时禁用，结束后恢复', async () => {
    const post = makePost()
    let release: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', () =>
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    )
    const wrapper = mountPostItem(post)

    await wrapper.get('[data-testid="like-button"]').trigger('click')

    expect(wrapper.get('[data-testid="like-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="favorite-button"]').attributes('disabled')).toBeDefined()

    release?.(jsonResponse({ post: { ...post, likes: 1, liked: true } }))
    await flushPromises()

    expect(wrapper.get('[data-testid="like-button"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="favorite-button"]').attributes('disabled')).toBeUndefined()
  })

  it('失败时提示服务不可用并保持原状', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    const wrapper = mountPostItem(makePost({ likes: 3 }))
    const toastStore = useToastStore()

    await wrapper.get('[data-testid="like-button"]').trigger('click')
    await flushPromises()

    expect(toastStore.message).toBe('操作失败，服务暂时不可用')
    expect(wrapper.get('[data-testid="like-count"]').text()).toBe('3')
    expect(wrapper.get('[data-testid="like-button"]').attributes('aria-pressed')).toBe('false')
  })
})

function mountPostItem(post: Post) {
  return mountWithPinia(PostItem, { props: { post, now: NOW } }).wrapper
}
