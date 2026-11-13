import { describe, expect, it, vi } from 'vitest'
import { PostApiError, createPostApi } from './postApi'

/** 记录到的一次请求，便于断言 URL / method / body。 */
interface RecordedCall {
  url: string
  init?: RequestInit
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

/** 构造可断言的 fetch 替身，记录每次请求的地址与配置。 */
function createFakeFetch(handler: (call: RecordedCall) => Response | Promise<Response>): {
  calls: RecordedCall[]
  fetchImpl: typeof fetch
} {
  const calls: RecordedCall[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = { url: resolveUrl(input), init }
    calls.push(call)
    return handler(call)
  }
  return { calls, fetchImpl }
}

/** 把 fetch 的入参归一成字符串地址。 */
function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

describe('postApi / list', () => {
  it('解析 { posts } 并清洗脏数据', async () => {
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({
        posts: [
          { id: 'b', content: ' 最新的 ', createdAt: 2_000 },
          { id: 'a', content: '较早的', createdAt: 1_000 },
          { id: 'bad', content: '   ', createdAt: 1_500 },
          null,
        ],
      }),
    )

    const posts = await createPostApi({ fetchImpl }).list()

    expect(calls[0]?.url).toBe('/api/posts')
    expect(posts.map((post) => post.id)).toEqual(['b', 'a'])
    expect(posts[0]?.content).toBe('最新的')
    expect(posts[1]?.content).toBe('较早的')
  })

  it('baseUrl 可覆盖为绝对地址', async () => {
    const { fetchImpl, calls } = createFakeFetch(() => jsonResponse({ posts: [] }))

    await createPostApi({ baseUrl: 'http://localhost:8787/api', fetchImpl }).list()

    expect(calls[0]?.url).toBe('http://localhost:8787/api/posts')
  })

  it('非 2xx 时抛 SERVER 并带状态码', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500))

    await expect(createPostApi({ fetchImpl }).list()).rejects.toMatchObject({
      code: 'SERVER',
      status: 500,
    })
  })

  it('响应体不是 JSON 时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => textResponse('oops'))

    await expect(createPostApi({ fetchImpl }).list()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('响应体缺少 posts 字段时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ items: [] }))

    await expect(createPostApi({ fetchImpl }).list()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('posts 不是数组时抛 INVALID_RESPONSE 而不是静默返回空列表', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ posts: 'oops' }))

    await expect(createPostApi({ fetchImpl }).list()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('fetch reject 时抛 NETWORK', async () => {
    const { fetchImpl } = createFakeFetch(() => Promise.reject(new Error('offline')))

    const error: unknown = await createPostApi({ fetchImpl })
      .list()
      .catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(PostApiError)
    if (!(error instanceof PostApiError)) return
    expect(error.code).toBe('NETWORK')
    expect(error.name).toBe('PostApiError')
  })
})

describe('postApi / create', () => {
  it('以 JSON 提交正文并返回新建动态', async () => {
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({ post: { id: 'new', content: '你好', createdAt: 1_700_000_000_000 } }, 201),
    )

    const post = await createPostApi({ fetchImpl }).create(' 你好 ')

    const call = calls[0]
    expect(call?.url).toBe('/api/posts')
    expect(call?.init?.method).toBe('POST')
    expect(new Headers(call?.init?.headers).get('Content-Type')).toBe('application/json')
    expect(call?.init?.body).toBe(JSON.stringify({ content: ' 你好 ' }))
    expect(post).toEqual({
      id: 'new',
      content: '你好',
      createdAt: 1_700_000_000_000,
      likes: 0,
      liked: false,
      favorited: false,
    })
  })

  it('400 EMPTY_CONTENT 映射为同名错误码', async () => {
    const { fetchImpl } = createFakeFetch(() =>
      jsonResponse({ error: { code: 'EMPTY_CONTENT', message: '内容不能为空' } }, 400),
    )

    await expect(createPostApi({ fetchImpl }).create('   ')).rejects.toMatchObject({
      code: 'EMPTY_CONTENT',
      status: 400,
    })
  })

  it('400 CONTENT_TOO_LONG 映射为同名错误码', async () => {
    const { fetchImpl } = createFakeFetch(() =>
      jsonResponse({ error: { code: 'CONTENT_TOO_LONG', message: '内容不能超过 280 个字符' } }, 400),
    )

    await expect(createPostApi({ fetchImpl }).create('あ'.repeat(281))).rejects.toMatchObject({
      code: 'CONTENT_TOO_LONG',
      status: 400,
    })
  })

  it('400 但错误码未知时按 SERVER 处理', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ error: { code: 'INVALID_BODY' } }, 400))

    await expect(createPostApi({ fetchImpl }).create('正文')).rejects.toMatchObject({
      code: 'SERVER',
      status: 400,
    })
  })

  it('201 但缺少 post 字段时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({}, 201))

    await expect(createPostApi({ fetchImpl }).create('正文')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('post 字段脏数据时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ post: { id: 'x', content: '   ' } }, 201))

    await expect(createPostApi({ fetchImpl }).create('正文')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('fetch reject 时抛 NETWORK', async () => {
    const { fetchImpl } = createFakeFetch(() => Promise.reject(new Error('offline')))

    await expect(createPostApi({ fetchImpl }).create('正文')).rejects.toMatchObject({
      code: 'NETWORK',
    })
  })

  it('错误信息不包含用户正文', async () => {
    const secret = '这是不该出现在错误里的正文'
    const { fetchImpl } = createFakeFetch(() =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } }, 500),
    )

    const error: unknown = await createPostApi({ fetchImpl })
      .create(secret)
      .catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(PostApiError)
    if (!(error instanceof PostApiError)) return
    expect(error.message).not.toContain(secret)
  })
})

describe('postApi / toggleLike 与 toggleFavorite', () => {
  it('点赞走 POST 并返回规整后的动态', async () => {
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({
        post: {
          id: 'p1',
          content: '你好',
          createdAt: 1_700_000_000_000,
          likes: 3,
          liked: true,
          favorited: false,
        },
      }),
    )

    const post = await createPostApi({ fetchImpl }).toggleLike('p1')

    expect(calls[0]?.url).toBe('/api/posts/p1/like')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(post).toEqual({
      id: 'p1',
      content: '你好',
      createdAt: 1_700_000_000_000,
      likes: 3,
      liked: true,
      favorited: false,
    })
  })

  it('收藏走 POST，并把脏的互动字段兜底成默认值', async () => {
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({
        post: { id: 'p2', content: ' 收藏我 ', createdAt: 1_700_000_000_000, likes: -2, liked: 'yes', favorited: true },
      }),
    )

    const post = await createPostApi({ fetchImpl }).toggleFavorite('p2')

    expect(calls[0]?.url).toBe('/api/posts/p2/favorite')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(post).toEqual({
      id: 'p2',
      content: '收藏我',
      createdAt: 1_700_000_000_000,
      likes: 0,
      liked: false,
      favorited: true,
    })
  })

  it('id 按 URL 段规则编码', async () => {
    const { fetchImpl, calls } = createFakeFetch(() =>
      jsonResponse({ post: { id: 'a/b c', content: '特殊 id', createdAt: 1_700_000_000_000 } }),
    )

    await createPostApi({ fetchImpl }).toggleFavorite('a/b c')

    expect(calls[0]?.url).toBe('/api/posts/a%2Fb%20c/favorite')
  })

  it('404 且错误码为 POST_NOT_FOUND 时抛 NOT_FOUND', async () => {
    const { fetchImpl } = createFakeFetch(() =>
      jsonResponse({ error: { code: 'POST_NOT_FOUND', message: '动态不存在 here' } }, 404),
    )

    const error: unknown = await createPostApi({ fetchImpl })
      .toggleLike('missing')
      .catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(PostApiError)
    if (!(error instanceof PostApiError)) return
    expect(error.code).toBe('NOT_FOUND')
    expect(error.status).toBe(404)
    expect(error.message).toBe('动态不存在')
  })

  it('404 但错误码未知时按 SERVER 处理', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ error: { code: 'UNKNOWN' } }, 404))

    await expect(createPostApi({ fetchImpl }).toggleFavorite('p1')).rejects.toMatchObject({
      code: 'SERVER',
      status: 404,
    })
  })

  it('404 且响应体不是 JSON 时按 SERVER 处理', async () => {
    const { fetchImpl } = createFakeFetch(() => textResponse('not found', 404))

    await expect(createPostApi({ fetchImpl }).toggleLike('p1')).rejects.toMatchObject({
      code: 'SERVER',
      status: 404,
    })
  })

  it('500 时抛 SERVER', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500))

    await expect(createPostApi({ fetchImpl }).toggleLike('p1')).rejects.toMatchObject({
      code: 'SERVER',
      status: 500,
    })
  })

  it('缺少 post 字段时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({}))

    await expect(createPostApi({ fetchImpl }).toggleLike('p1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('post 字段不是对象时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ post: 'oops' }))

    await expect(createPostApi({ fetchImpl }).toggleFavorite('p1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('post 缺少有效内容时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() => jsonResponse({ post: { id: 'p1', content: '   ' } }))

    await expect(createPostApi({ fetchImpl }).toggleLike('p1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('返回的 id 与请求 id 不一致时抛 INVALID_RESPONSE', async () => {
    const { fetchImpl } = createFakeFetch(() =>
      jsonResponse({ post: { id: 'other', content: '别人的动态', createdAt: 1_700_000_000_000 } }),
    )

    await expect(createPostApi({ fetchImpl }).toggleLike('p1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('fetch reject 时抛 NETWORK', async () => {
    const { fetchImpl } = createFakeFetch(() => Promise.reject(new Error('offline')))

    await expect(createPostApi({ fetchImpl }).toggleLike('p1')).rejects.toMatchObject({
      code: 'NETWORK',
    })
  })
})

describe('postApi / fetch 解析时机', () => {
  it('未注入 fetchImpl 时每次调用都读取 globalThis.fetch', async () => {
    const api = createPostApi()
    const { fetchImpl, calls } = createFakeFetch(() => jsonResponse({ posts: [] }))
    vi.stubGlobal('fetch', fetchImpl)

    await api.list()
    await api.list()

    expect(calls).toHaveLength(2)
  })
})
