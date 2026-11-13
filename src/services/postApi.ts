import { API_BASE_PATH, MAX_LENGTH } from '../../shared/constants'
import { sanitizePosts } from '@/lib/sanitize'
import type { Post } from '@/types/post'

/** 前端可区分的接口错误码：网络层、响应格式、服务端异常与两类业务校验失败。 */
export type PostApiErrorCode =
  | 'NETWORK'
  | 'INVALID_RESPONSE'
  | 'SERVER'
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

/** 动态接口的最小能力集，store 只依赖这两个方法。 */
export interface PostApi {
  list(): Promise<Post[]>
  create(content: string): Promise<Post>
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
      const [post] = sanitizePosts([readField(payload, 'post')])
      if (!post) throw invalidResponse(response)

      return post
    },
  }
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
