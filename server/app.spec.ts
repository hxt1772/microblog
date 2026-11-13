// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { createPostStore } from './store'
import type { PostStore } from './store'
import { API_BASE_PATH, MAX_LENGTH } from '../shared/constants'

/** 构造 JSON 请求体。 */
function jsonRequest(body: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }
}

describe('createApp', () => {
  it('GET /api/health 返回状态与当前条数', async () => {
    const store = createPostStore()
    store.add({ content: '已有一条' })
    const app = createApp({ store })

    const response = await app.request(`${API_BASE_PATH}/health`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ status: 'ok', count: 1 })
  })

  it('GET /api/posts 初始返回空列表', async () => {
    const app = createApp({ store: createPostStore() })

    const response = await app.request(`${API_BASE_PATH}/posts`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ posts: [] })
  })

  it('POST /api/posts 成功时返回 201 且出现在列表中', async () => {
    const store = createPostStore()
    const app = createApp({ store })

    const response = await app.request(
      `${API_BASE_PATH}/posts`,
      jsonRequest(JSON.stringify({ content: '  第一条动态  ' })),
    )

    expect(response.status).toBe(201)
    const created = (await response.json()) as { post: { id: string; content: string; createdAt: number } }
    expect(created.post.content).toBe('第一条动态')
    expect(typeof created.post.id).toBe('string')
    expect(typeof created.post.createdAt).toBe('number')

    const listResponse = await app.request(`${API_BASE_PATH}/posts`)
    const list = (await listResponse.json()) as { posts: { id: string }[] }
    expect(list.posts).toHaveLength(1)
    expect(list.posts[0]?.id).toBe(created.post.id)
  })

  it('POST /api/posts 空白内容返回 400 EMPTY_CONTENT', async () => {
    const store = createPostStore()
    const app = createApp({ store })

    const response = await app.request(
      `${API_BASE_PATH}/posts`,
      jsonRequest(JSON.stringify({ content: '   ' })),
    )

    expect(response.status).toBe(400)
    const payload = (await response.json()) as { error: { code: string; message: string } }
    expect(payload.error.code).toBe('EMPTY_CONTENT')
    expect(payload.error.message.length).toBeGreaterThan(0)
    expect(store.count()).toBe(0)
  })

  it('POST /api/posts 超长内容返回 400 CONTENT_TOO_LONG', async () => {
    const app = createApp({ store: createPostStore() })

    const response = await app.request(
      `${API_BASE_PATH}/posts`,
      jsonRequest(JSON.stringify({ content: 'a'.repeat(MAX_LENGTH + 1) })),
    )

    expect(response.status).toBe(400)
    const payload = (await response.json()) as { error: { code: string } }
    expect(payload.error.code).toBe('CONTENT_TOO_LONG')
  })

  it('POST /api/posts 非法 JSON 返回 400 INVALID_BODY', async () => {
    const app = createApp({ store: createPostStore() })

    const response = await app.request(`${API_BASE_PATH}/posts`, jsonRequest('{not-json'))

    expect(response.status).toBe(400)
    const payload = (await response.json()) as { error: { code: string; message: string } }
    expect(payload.error.code).toBe('INVALID_BODY')
    expect(payload.error.message.length).toBeGreaterThan(0)
  })

  it('POST /api/posts 的 content 不是字符串时返回 400 INVALID_BODY', async () => {
    const app = createApp({ store: createPostStore() })

    for (const body of ['{}', JSON.stringify({ content: 42 }), JSON.stringify({ content: null }), '[]']) {
      const response = await app.request(`${API_BASE_PATH}/posts`, jsonRequest(body))

      expect(response.status).toBe(400)
      const payload = (await response.json()) as { error: { code: string } }
      expect(payload.error.code).toBe('INVALID_BODY')
    }
  })

  it('未知路由返回 404 JSON', async () => {
    const app = createApp({ store: createPostStore() })

    const response = await app.request('/api/unknown')

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    const payload = (await response.json()) as { error: { code: string; message: string } }
    expect(payload.error.code).toBe('NOT_FOUND')
    expect(payload.error.message.length).toBeGreaterThan(0)
  })

  it('store 抛错时返回 500 且不泄露内部信息', async () => {
    const brokenStore: PostStore = {
      list() {
        throw new Error('boom: 内部数据库连接串 postgres://secret')
      },
      add() {
        throw new Error('boom: 内部写入细节')
      },
      count() {
        throw new Error('boom: 内部计数细节')
      },
      toggleLike() {
        throw new Error('boom: 内部点赞细节')
      },
      toggleFavorite() {
        throw new Error('boom: 内部收藏细节')
      },
    }
    const app = createApp({ store: brokenStore })

    const response = await app.request(`${API_BASE_PATH}/posts`)

    expect(response.status).toBe(500)
    const payload = (await response.json()) as { error: { code: string; message: string } }
    expect(payload).toEqual({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } })
    expect(JSON.stringify(payload)).not.toContain('boom')
  })

  it('CORS 中间件覆盖普通响应与 OPTIONS 预检', async () => {
    const app = createApp({ store: createPostStore() })

    const health = await app.request(`${API_BASE_PATH}/health`)
    expect(health.headers.get('access-control-allow-origin')).toBe('*')

    const preflight = await app.request(`${API_BASE_PATH}/posts`, { method: 'OPTIONS' })
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
  })
})

describe('createApp 互动接口', () => {
  /** 建一个含一条动态的应用，返回 app 与动态 id。 */
  function setup(): { app: ReturnType<typeof createApp>; id: string } {
    const store = createPostStore()
    const post = store.add({ content: '今天风很大' })
    return { app: createApp({ store }), id: post.id }
  }

  it('POST /api/posts/:id/like 首次点赞返回 200 与最新状态', async () => {
    const { app, id } = setup()

    const response = await app.request(`${API_BASE_PATH}/posts/${id}/like`, { method: 'POST' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const payload = (await response.json()) as {
      post: { id: string; likes: number; liked: boolean; favorited: boolean }
    }
    expect(payload.post.id).toBe(id)
    expect(payload.post.likes).toBe(1)
    expect(payload.post.liked).toBe(true)
    expect(payload.post.favorited).toBe(false)
  })

  it('POST /api/posts/:id/like 再次调用取消点赞', async () => {
    const { app, id } = setup()

    await app.request(`${API_BASE_PATH}/posts/${id}/like`, { method: 'POST' })
    const response = await app.request(`${API_BASE_PATH}/posts/${id}/like`, { method: 'POST' })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { post: { likes: number; liked: boolean } }
    expect(payload.post.likes).toBe(0)
    expect(payload.post.liked).toBe(false)
  })

  it('POST /api/posts/:id/favorite 切换收藏且不影响点赞', async () => {
    const { app, id } = setup()

    const response = await app.request(`${API_BASE_PATH}/posts/${id}/favorite`, { method: 'POST' })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { post: { likes: number; liked: boolean; favorited: boolean } }
    expect(payload.post.favorited).toBe(true)
    expect(payload.post.liked).toBe(false)
    expect(payload.post.likes).toBe(0)
  })

  it('点赞后 GET /api/posts 能看到最新状态', async () => {
    const { app, id } = setup()

    await app.request(`${API_BASE_PATH}/posts/${id}/like`, { method: 'POST' })
    await app.request(`${API_BASE_PATH}/posts/${id}/favorite`, { method: 'POST' })

    const listResponse = await app.request(`${API_BASE_PATH}/posts`)
    const list = (await listResponse.json()) as {
      posts: { id: string; likes: number; liked: boolean; favorited: boolean }[]
    }
    expect(list.posts).toHaveLength(1)
    expect(list.posts[0]?.id).toBe(id)
    expect(list.posts[0]?.likes).toBe(1)
    expect(list.posts[0]?.liked).toBe(true)
    expect(list.posts[0]?.favorited).toBe(true)
  })

  it('未知 id 的点赞 / 收藏返回 404 JSON 与 POST_NOT_FOUND', async () => {
    const { app } = setup()

    for (const action of ['like', 'favorite']) {
      const response = await app.request(`${API_BASE_PATH}/posts/missing/${action}`, { method: 'POST' })

      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/json')
      const payload = (await response.json()) as { error: { code: string; message: string } }
      expect(payload.error.code).toBe('POST_NOT_FOUND')
      expect(payload.error.message.length).toBeGreaterThan(0)
    }
  })

  it('无效 id 一律返回 404 JSON，不会被当成命中记录', async () => {
    const { app } = setup()

    // 空段匹配不到 `:id` 路由，落到全局 404；但绝不能是 200
    const emptyId = await app.request(`${API_BASE_PATH}/posts//like`, { method: 'POST' })
    expect(emptyId.status).toBe(404)
    expect(emptyId.headers.get('content-type')).toContain('application/json')

    // 空白 id 能匹配路由但查不到记录，走 POST_NOT_FOUND
    const blankId = await app.request(`${API_BASE_PATH}/posts/${encodeURIComponent(' ')}/favorite`, {
      method: 'POST',
    })
    expect(blankId.status).toBe(404)
    expect(blankId.headers.get('content-type')).toContain('application/json')
    const payload = (await blankId.json()) as { error: { code: string } }
    expect(payload.error.code).toBe('POST_NOT_FOUND')
  })
})
