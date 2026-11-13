import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { API_BASE_PATH } from '../shared/constants'
import type { PostInput } from '../shared/post'
import { PostValidationError, createPostStore } from './store'
import type { PostStore } from './store'

/** 应用装配选项。 */
export interface AppOptions {
  /** 注入存储实现，缺省在内部新建一个内存存储。 */
  store?: PostStore
}

/** 请求体不合法（非 JSON / 非对象 / `content` 非字符串），统一映射为 400 INVALID_BODY。 */
class InvalidBodyError extends Error {
  constructor() {
    super('请求体必须是 { "content": "..." } 形式的 JSON 对象')
    this.name = 'InvalidBodyError'
  }
}

/** 解析并校验请求体，只接受 `{ content: string }`。 */
async function readPostInput(c: Context): Promise<PostInput> {
  let payload: unknown

  try {
    payload = await c.req.json()
  } catch {
    throw new InvalidBodyError()
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new InvalidBodyError()
  }

  const { content } = payload as { content?: unknown }
  if (typeof content !== 'string') throw new InvalidBodyError()

  return { content }
}

/** 创建 Hono 应用，所有响应体均为 JSON。 */
export function createApp(options: AppOptions = {}): Hono {
  const store = options.store ?? createPostStore()
  const app = new Hono()

  // 前后端分端口开发，放开跨域并覆盖 OPTIONS 预检
  app.use('*', cors({ origin: '*' }))

  app.get(`${API_BASE_PATH}/health`, (c) => c.json({ status: 'ok', count: store.count() }))

  app.get(`${API_BASE_PATH}/posts`, (c) => c.json({ posts: store.list() }))

  app.post(`${API_BASE_PATH}/posts`, async (c) => c.json({ post: store.add(await readPostInput(c)) }, 201))

  // Hono 默认 404 是纯文本，这里统一成 JSON 错误体
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404))

  app.onError((error, c) => {
    if (error instanceof PostValidationError) {
      return c.json({ error: { code: error.code, message: error.message } }, 400)
    }

    if (error instanceof InvalidBodyError) {
      return c.json({ error: { code: 'INVALID_BODY', message: error.message } }, 400)
    }

    // 未预期异常一律脱敏，避免把内部实现细节透给客户端
    return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } }, 500)
  })

  return app
}
