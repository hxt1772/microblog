import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ENTRIES, MAX_LENGTH } from '@/config/constants'
import { installFakeServer } from '@/test-utils/fakeServer'
import type { Post } from '@/types/post'
import { usePostsStore } from './usePostsStore'

// 2026-11-13（周五）15:30
const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()
const TOMORROW = new Date(2026, 10, 14, 15, 30, 0).getTime()

beforeEach(() => {
  setActivePinia(createPinia())
})

/** 构造一个总是失败的 fetch，用于模拟服务不可用。 */
function stubBrokenFetch(): void {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
}

/** 包一层计数器，用于断言「校验失败时不发请求」。 */
function countRequests(): () => number {
  const inner = globalThis.fetch
  let total = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    total += 1
    return inner(input, init)
  })
  return () => total
}

/** 构造一条动态，默认是最新的一条未点赞未收藏记录。 */
function seedPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    content: '第一条',
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

/** 按「切换」语义算出互动后的记录，模拟服务端行为。 */
function toggleReaction(post: Post, kind: 'like' | 'favorite'): Post {
  if (kind === 'like') {
    return { ...post, liked: !post.liked, likes: post.liked ? post.likes - 1 : post.likes + 1 }
  }
  return { ...post, favorited: !post.favorited }
}

interface StubPostsServerOptions {
  /** GET /api/posts 返回的列表。 */
  initial: readonly Post[]
  /** 互动请求的响应；可返回永不 settle 的 Promise 以观察 pending 状态。 */
  react: (kind: 'like' | 'favorite', post: Post) => Response | Promise<Response>
}

/**
 * 只实现本任务需要的两个端点：列表与点赞 / 收藏。
 * 互动路由在其它分支并行实现，这里用替身隔离，避免测试依赖未合并的后端。
 */
function stubPostsServer(options: StubPostsServerOptions): { reactionCalls: () => string[] } {
  const reactions: string[] = []
  const find = (id: string): Post | undefined =>
    options.initial.find((post) => post.id === id)

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'

    if (method === 'GET') return jsonResponse({ posts: options.initial })

    const match = /^\/api\/posts\/([^/]+)\/(like|favorite)$/.exec(url)
    if (!match) return jsonResponse({ error: { code: 'NOT_IMPLEMENTED' } }, 500)

    reactions.push(`${method} ${url}`)
    const target = find(decodeURIComponent(match[1] as string))
    if (!target) {
      return jsonResponse({ error: { code: 'POST_NOT_FOUND', message: '动态不存在' } }, 404)
    }

    return options.react(match[2] as 'like' | 'favorite', target)
  })

  return { reactionCalls: () => reactions }
}

describe('usePostsStore / 初始状态与 hydrate', () => {
  it('初始状态为空、未水合且无请求', () => {
    const store = usePostsStore()

    expect(store.posts).toEqual([])
    expect(store.hydrated).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.apiAvailable).toBe(true)
    expect(store.stats.total).toBe(0)
    expect(store.stats.days).toHaveLength(7)
  })

  it('从服务端加载并保持时间倒序', async () => {
    installFakeServer({
      now: () => NOW,
      seed: [
        { content: '早些的', createdAt: NOW - 60_000 },
        { content: '最新的', createdAt: NOW },
        { content: '中间', createdAt: NOW - 30_000 },
      ],
    })

    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(store.hydrated).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.apiAvailable).toBe(true)
    expect(store.posts.map((post) => post.content)).toEqual(['最新的', '中间', '早些的'])
    expect(store.stats.total).toBe(3)
    expect(store.stats.today).toBe(3)
  })

  it('loading 状态在水合过程中流转', async () => {
    installFakeServer()
    const store = usePostsStore()

    const pending = store.hydrate(NOW)
    expect(store.loading).toBe(true)
    expect(store.hydrated).toBe(false)

    await pending
    expect(store.loading).toBe(false)
    expect(store.hydrated).toBe(true)
  })

  it('服务不可用时置 apiAvailable=false、清空列表但标记已水合', async () => {
    stubBrokenFetch()

    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(store.posts).toEqual([])
    expect(store.apiAvailable).toBe(false)
    expect(store.hydrated).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('服务端返回异常状态时同样降级', async () => {
    installFakeServer()
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('boom', { status: 500 })))

    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(store.apiAvailable).toBe(false)
    expect(store.posts).toEqual([])
  })
})

describe('usePostsStore / publish', () => {
  it('发布成功后置顶、更新统计并写入服务端', async () => {
    const server = installFakeServer({ now: () => NOW })
    const store = usePostsStore()
    await store.hydrate(NOW)

    await store.publish('第一条', NOW - 1000)
    const result = await store.publish('第二条', NOW)

    expect(result.ok).toBe(true)
    expect(store.posts).toHaveLength(2)
    expect(store.posts[0]?.content).toBe('第二条')
    expect(store.stats.total).toBe(2)
    expect(store.stats.today).toBe(2)
    expect(store.stats.chars).toBe(6)
    expect(store.apiAvailable).toBe(true)

    const stored = server.store.list()
    expect(stored.map((post) => post.content)).toEqual(['第二条', '第一条'])
  })

  it('返回新建的动态，包含服务端生成的 id 与时间戳', async () => {
    installFakeServer({ now: () => NOW })
    const store = usePostsStore()
    await store.hydrate(NOW)

    const result = await store.publish('你好', NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.post.content).toBe('你好')
    expect(result.post.createdAt).toBe(NOW)
    expect(result.post.id).toBeTruthy()
    expect(store.posts[0]).toEqual(result.post)
  })

  it('发布时去除首尾空白', async () => {
    installFakeServer({ now: () => NOW })
    const store = usePostsStore()
    await store.hydrate(NOW)

    await store.publish('  两侧有空格  ', NOW)

    expect(store.posts[0]?.content).toBe('两侧有空格')
  })

  it('空白内容被本地拒绝且不发出请求', async () => {
    installFakeServer()
    const store = usePostsStore()
    await store.hydrate(NOW)
    const requests = countRequests()

    expect(await store.publish('   ', NOW)).toEqual({ ok: false, reason: 'empty' })
    expect(await store.publish('\n\t', NOW)).toEqual({ ok: false, reason: 'empty' })
    expect(store.posts).toEqual([])
    expect(requests()).toBe(0)
  })

  it('超过上限的内容被本地拒绝且不发出请求，正好上限可通过', async () => {
    installFakeServer({ now: () => NOW })
    const store = usePostsStore()
    await store.hydrate(NOW)
    const requests = countRequests()

    expect(await store.publish('あ'.repeat(MAX_LENGTH + 1), NOW)).toEqual({
      ok: false,
      reason: 'too-long',
    })
    expect(store.posts).toEqual([])
    expect(requests()).toBe(0)

    expect((await store.publish('あ'.repeat(MAX_LENGTH), NOW)).ok).toBe(true)
    expect(store.posts[0]?.content).toHaveLength(MAX_LENGTH)
  })

  it('服务端 400 EMPTY_CONTENT 映射为 empty', async () => {
    installFakeServer()
    const store = usePostsStore()
    await store.hydrate(NOW)
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'EMPTY_CONTENT', message: '内容不能为空' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    // 本地校验被绕过时（例如规则调整）仍以服务端结果为准
    expect(await store.publish('绕过本地校验', NOW)).toEqual({ ok: false, reason: 'empty' })
    expect(store.posts).toEqual([])
  })

  it('服务端 400 CONTENT_TOO_LONG 映射为 too-long', async () => {
    installFakeServer()
    const store = usePostsStore()
    await store.hydrate(NOW)
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'CONTENT_TOO_LONG', message: '内容不能超过 280 个字符' } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    expect(await store.publish('绕过本地校验', NOW)).toEqual({ ok: false, reason: 'too-long' })
  })

  it('网络失败时返回 unavailable 并标记服务不可用', async () => {
    installFakeServer()
    const store = usePostsStore()
    await store.hydrate(NOW)
    stubBrokenFetch()

    const result = await store.publish('发不出去', NOW)

    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(store.posts).toEqual([])
    expect(store.apiAvailable).toBe(false)
  })

  it('最多保留 300 条，超出时丢弃最旧记录', async () => {
    const seeded = Array.from({ length: MAX_ENTRIES }, (_, index) => ({
      content: `旧内容 ${index}`,
      createdAt: NOW - (index + 1) * 1000,
    }))
    const server = installFakeServer({ now: () => NOW, seed: seeded })
    const store = usePostsStore()
    await store.hydrate(NOW)
    expect(store.posts).toHaveLength(MAX_ENTRIES)

    await store.publish('最新一条', NOW)

    expect(store.posts).toHaveLength(MAX_ENTRIES)
    expect(store.posts[0]?.content).toBe('最新一条')
    expect(store.posts.some((post) => post.content === `旧内容 ${MAX_ENTRIES - 1}`)).toBe(false)
    expect(server.store.count()).toBe(MAX_ENTRIES)
  })
})

describe('usePostsStore / 点赞与收藏', () => {
  it('点赞成功后原位替换同 id 记录并保持列表顺序', async () => {
    const initial = [
      seedPost({ id: 'p2', content: '最新的', createdAt: NOW }),
      seedPost({ id: 'p1', content: '较早的', createdAt: NOW - 60_000 }),
    ]
    stubPostsServer({
      initial,
      react: (kind, post) => jsonResponse({ post: toggleReaction(post, kind) }),
    })
    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(await store.toggleLike('p1')).toBe(true)

    expect(store.posts.map((post) => post.id)).toEqual(['p2', 'p1'])
    expect(store.posts[1]).toMatchObject({ id: 'p1', likes: 1, liked: true, favorited: false })
    expect(store.posts[0]).toMatchObject({ id: 'p2', likes: 0, liked: false })
    expect(store.apiAvailable).toBe(true)
  })

  it('收藏成功后解除收藏同样以服务端结果为准', async () => {
    const initial = [seedPost({ id: 'p1', favorited: true })]
    stubPostsServer({ initial, react: (kind, post) => jsonResponse({ post: toggleReaction(post, kind) }) })
    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(await store.toggleFavorite('p1')).toBe(true)

    expect(store.posts[0]).toMatchObject({ id: 'p1', favorited: false })
    expect(store.favoriteCount).toBe(0)
  })

  it('同一 id 请求飞行中时重复点击直接返回 false 且不发第二次请求', async () => {
    const initial = [seedPost({ id: 'p1' })]
    let release: ((response: Response) => void) | undefined
    const { reactionCalls } = stubPostsServer({
      initial,
      react: () => new Promise<Response>((resolve) => {
        release = resolve
      }),
    })
    const store = usePostsStore()
    await store.hydrate(NOW)

    const first = store.toggleLike('p1')
    expect(store.isPending('p1')).toBe(true)
    expect(await store.toggleLike('p1')).toBe(false)
    // 同一 id 的 pending 状态对两个互动按钮一致生效
    expect(await store.toggleFavorite('p1')).toBe(false)
    expect(reactionCalls()).toHaveLength(1)

    release?.(jsonResponse({ post: toggleReaction(initial[0], 'like') }))
    expect(await first).toBe(true)
    expect(store.isPending('p1')).toBe(false)
  })

  it('不同 id 可以并发请求', async () => {
    const initial = [seedPost({ id: 'p1' }), seedPost({ id: 'p2', createdAt: NOW - 1000 })]
    stubPostsServer({ initial, react: (kind, post) => jsonResponse({ post: toggleReaction(post, kind) }) })
    const store = usePostsStore()
    await store.hydrate(NOW)

    const results = await Promise.all([store.toggleLike('p1'), store.toggleFavorite('p2')])

    expect(results).toEqual([true, true])
    expect(store.posts.find((post) => post.id === 'p1')?.liked).toBe(true)
    expect(store.posts.find((post) => post.id === 'p2')?.favorited).toBe(true)
  })

  it('网络失败时返回 false、置 apiAvailable=false 且列表不变', async () => {
    const initial = [seedPost({ id: 'p1', likes: 5 })]
    stubPostsServer({ initial, react: () => Promise.reject(new Error('offline')) })
    const store = usePostsStore()
    await store.hydrate(NOW)
    const snapshot = store.posts.map((post) => ({ ...post }))

    expect(await store.toggleLike('p1')).toBe(false)

    expect(store.posts).toEqual(snapshot)
    expect(store.apiAvailable).toBe(false)
    expect(store.isPending('p1')).toBe(false)
  })

  it('服务端 404 时同样返回 false 且列表不变', async () => {
    const initial = [seedPost({ id: 'p1' })]
    stubPostsServer({
      initial,
      react: () =>
        jsonResponse({ error: { code: 'POST_NOT_FOUND', message: '动态不存在' } }, 404),
    })
    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(await store.toggleFavorite('p1')).toBe(false)
    expect(store.posts[0]).toMatchObject({ id: 'p1', favorited: false })
    expect(store.apiAvailable).toBe(false)
  })

  it('favorites 与 favoriteCount 只统计已收藏记录并保持原顺序', async () => {
    const initial = [
      seedPost({ id: 'p3', content: '最新的', createdAt: NOW }),
      seedPost({ id: 'p2', content: '中间的', createdAt: NOW - 1000, favorited: true }),
      seedPost({ id: 'p1', content: '较早的', createdAt: NOW - 2000, favorited: true }),
    ]
    stubPostsServer({ initial, react: (kind, post) => jsonResponse({ post: toggleReaction(post, kind) }) })
    const store = usePostsStore()
    await store.hydrate(NOW)

    expect(store.favorites.map((post) => post.id)).toEqual(['p2', 'p1'])
    expect(store.favoriteCount).toBe(2)
  })

  it('hydrate 成功后清空 pendingIds', async () => {
    const initial = [seedPost({ id: 'p1' })]
    stubPostsServer({ initial, react: () => new Promise<Response>(() => {}) })
    const store = usePostsStore()
    await store.hydrate(NOW)

    void store.toggleLike('p1')
    expect(store.isPending('p1')).toBe(true)

    await store.hydrate(NOW)

    expect(store.isPending('p1')).toBe(false)
  })

  it('hydrate 失败后同样清空 pendingIds', async () => {
    const initial = [seedPost({ id: 'p1' })]
    stubPostsServer({ initial, react: () => new Promise<Response>(() => {}) })
    const store = usePostsStore()
    await store.hydrate(NOW)

    void store.toggleFavorite('p1')
    expect(store.isPending('p1')).toBe(true)

    stubBrokenFetch()
    await store.hydrate(NOW)

    expect(store.isPending('p1')).toBe(false)
    expect(store.apiAvailable).toBe(false)
  })
})

describe('usePostsStore / 时间推进', () => {
  it('syncTicker 推进基准时间后今日计数归零', async () => {
    installFakeServer({ now: () => NOW })
    const store = usePostsStore()
    await store.hydrate(NOW)
    await store.publish('今天的动态', NOW)
    expect(store.stats.today).toBe(1)

    store.syncTicker(TOMORROW)

    expect(store.stats.today).toBe(0)
    expect(store.stats.total).toBe(1)
    expect(store.stats.days.at(-1)?.label).toBe('今天')
  })

  it('todayKey 随基准时间变化，可用于跨天检测', async () => {
    installFakeServer()
    const store = usePostsStore()
    await store.hydrate(NOW)
    expect(store.todayKey).toBe('2026-11-13')

    store.syncTicker(TOMORROW)
    expect(store.todayKey).toBe('2026-11-14')
  })
})
