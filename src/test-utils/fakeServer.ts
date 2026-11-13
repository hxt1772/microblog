import { vi } from 'vitest'
import { createApp } from '../../server/app'
import { createPostStore } from '../../server/store'
import type { PostStore } from '../../server/store'

/** 预置一条服务端数据，`createdAt` 直接决定列表顺序与统计分桶。 */
export interface FakeServerSeed {
  content: string
  createdAt: number
}

/** fake server 的可选配置。 */
export interface FakeServerOptions {
  /** 预置数据，按给定顺序写入服务端内存存储。 */
  seed?: readonly FakeServerSeed[]
  /** 服务端时钟，缺省 `Date.now`；预置数据会先按顺序消耗各自的 createdAt。 */
  now?: () => number
  /** id 工厂，缺省使用服务端默认实现。 */
  createId?: () => string
}

/** 安装结果：暴露服务端存储用于断言，并提供还原全局 fetch 的方法。 */
export interface FakeServer {
  store: PostStore
  restore(): void
}

/**
 * 把 `globalThis.fetch` 接到真实的 Hono 应用上（`app.request()`），
 * 让前端 store / 组件在测试中跑真实的 REST 语义，而不是 mock 掉 store 内部。
 */
export function installFakeServer(options: FakeServerOptions = {}): FakeServer {
  const seeded = options.seed ?? []
  const baseNow = options.now ?? Date.now
  const seedTimes = seeded.map((item) => item.createdAt)
  let cursor = 0

  const store = createPostStore({
    // 预置阶段按需返回给定时间，消耗完后退回真实（或注入的）时钟
    now: () => {
      const seededTime = seedTimes[cursor]
      if (seededTime === undefined) return baseNow()
      cursor += 1
      return seededTime
    },
    createId: options.createId,
  })

  for (const item of seeded) store.add({ content: item.content })

  const app = createApp({ store })
  const previousFetch = globalThis.fetch

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = await toHonoRequest(input, init)
    return app.request(request.path, request.init)
  }

  vi.stubGlobal('fetch', fetchImpl)

  return {
    store,
    restore(): void {
      vi.stubGlobal('fetch', previousFetch)
    },
  }
}

/** 把 fetch 的入参转换成 Hono `app.request(path, init)` 需要的形态。 */
async function toHonoRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ path: string; init?: RequestInit }> {
  if (typeof input === 'string' || input instanceof URL) {
    return { path: toPath(input.toString()), init }
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    const body = await input.clone().text()
    return {
      path: toPath(input.url),
      init: { method: input.method, headers: input.headers, body: body || undefined },
    }
  }

  return { path: toPath(String(input)), init }
}

/** 相对地址原样返回，绝对地址只保留 path + query（Hono 只关心路由部分）。 */
function toPath(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}
