import { API_BASE_PATH, MAX_LENGTH } from '../../shared/constants'
import { sanitizePosts } from '@/lib/sanitize'
import type { Post } from '@/types/post'

/** 前端可区分的接口错误码：网络层、响应格式、服务端异常、目标不存在与两类业务校验失败。 */
export type PostApiErrorCode =
  | 'NETWORK'
  | 'INVALID_RESPONSE'
  | 'SERVER'
  | 'NOT_FOUND'
  | 'EMPTY_CONTENT'
  | 'CONTENT_TOO_LONG'

/** 统一的接口错误：只携带错误码与状态码，提示语绝不包含用户正文。 */
export class PostApiError extends Error {
  readonly code: PostApiErrorCode
  readonly status?: number

  constructor(code: PostApiErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'PostApiError'
    this.code = code
    this.status = status
  }
}

/** 创建接口客户端所需依赖，测试可替换 baseUrl 与 fetch 实现。 */
export interface PostApiOptions {
  /** 接口前缀，缺省同源 `/api`。 */
  baseUrl?: string
  /** fetch 实现，缺省在每次调用时读取 `globalThis.fetch`，便于测试替换。 */
  fetchImpl?: typeof fetch
}

/** 动态接口的最小能力集，store 只依赖这几个方法。 */
export interface PostApi {
  list(): Promise<Post[]>
  create(content: string): Promise<Post>
  /** 切换点赞（再点一次即取消），返回服务端权威记录。 */
  toggleLike(id: string): Promise<Post>
  /** 切换收藏（再点一次即取消），返回服务端权威记录。 */
  toggleFavorite(id: string): Promise<Post>
}

/**
 * 创建 REST 客户端：所有响应都做防御性校验，
 * 任何异常都收敛成 `PostApiError`，调用方只需按 code 分流。
 */
export function createPostApi(options: PostApiOptions = {}): PostApi {
  const baseUrl = options.baseUrl ?? API_BASE_PATH
  const postsUrl = `${baseUrl}/posts`

  /** 每次调用时再读取 fetch，保证测试中的全局 stub 生效。 */
  function resolveFetch(): typeof fetch {
    const impl = options.fetchImpl ?? globalThis.fetch
    if (!impl) throw new PostApiError('NETWORK', '当前环境不支持 fetch')
    return impl
  }

  async function request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await resolveFetch()(url, init)
    } catch {
      throw new PostApiError('NETWORK', '无法连接到服务，请检查网络后重试')
    }
  }

  /** 点赞 / 收藏共用的切换请求：两者都是无请求体的 POST，响应形态一致。 */
  async function toggle(id: string, kind: 'like' | 'favorite'): Promise<Post> {
    const response = await request(`${postsUrl}/${encodeURIComponent(id)}/${kind}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) throw await toReactionError(response)

    const payload = await readJson(response)
    return readPost(payload, response, id)
  }

  return {
    async list(): Promise<Post[]> {
      const response = await request(postsUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) throw serverError(response)

      const payload = await readJson(response)
      const posts = readField(payload, 'posts')
      // 缺失或类型不对都视为响应不规范，避免静默返回空列表掩盖后端故障
      if (!Array.isArray(posts)) throw invalidResponse(response)

      return sanitizePosts(posts)
    },

    async create(content: string): Promise<Post> {
      const response = await request(postsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) throw await toWriteError(response)

      const payload = await readJson(response)
      return readPost(payload, response)
    },

    toggleLike(id: string): Promise<Post> {
      return toggle(id, 'like')
    },

    toggleFavorite(id: string): Promise<Post> {
      return toggle(id, 'favorite')
    },
  }
}

/**
 * 解析写入类响应的 `{ post }`：一律走 `sanitizePosts` 规整，
 * 缺失、脏数据或 id 与请求 id 不一致都视为响应不规范，
 * 避免调用方拿到不属于该 id 的记录后静默地更新错误条目。
 */
function readPost(payload: unknown, response: Response, expectedId?: string): Post {
  const [post] = sanitizePosts([readField(payload, 'post')])
  if (!post) throw invalidResponse(response)
  if (expectedId !== undefined && post.id !== expectedId) throw invalidResponse(response)
  return post
}

/** 解析 JSON 响应体；非 JSON 一律视为格式错误。 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new PostApiError('INVALID_RESPONSE', '服务返回的数据格式无法解析', response.status)
  }
}

/** 读取响应体顶层字段，非对象时返回 `undefined`。 */
function readField(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined
  return (payload as Record<string, unknown>)[key]
}

function invalidResponse(response: Response): PostApiError {
  return new PostApiError('INVALID_RESPONSE', '服务返回的数据格式不正确', response.status)
}

function serverError(response: Response): PostApiError {
  return new PostApiError('SERVER', `服务返回异常状态 ${response.status}`, response.status)
}

/**
 * 互动接口失败：只有 404 + POST_NOT_FOUND 是「目标不存在」，
 * 其余（含形态不明的 404）统一按 SERVER 处理，避免把网关错误当成业务语义。
 */
async function toReactionError(response: Response): Promise<PostApiError> {
  if (response.status === 404 && (await readErrorCode(response)) === 'POST_NOT_FOUND') {
    return new PostApiError('NOT_FOUND', '动态不存在', 404)
  }
  return serverError(response)
}

/** 尽力读取错误体里的 code；响应体不是 JSON 时返回 undefined，不改变错误分类。 */
async function readErrorCode(response: Response): Promise<unknown> {
  try {
    const payload: unknown = await response.json()
    return readField(readField(payload, 'error'), 'code')
  } catch {
    return undefined
  }
}

/** 把发帖失败响应映射为业务错误码，未知错误码统一按 SERVER 处理。 */
async function toWriteError(response: Response): Promise<PostApiError> {
  if (response.status === 400) {
    const payload = await readJson(response)
    const code = readField(readField(payload, 'error'), 'code')

    if (code === 'EMPTY_CONTENT') return new PostApiError(code, '内容不能为空', 400)
    if (code === 'CONTENT_TOO_LONG') {
      return new PostApiError(code, `内容不能超过 ${MAX_LENGTH} 个字符`, 400)
    }
  }

  return serverError(response)
}
