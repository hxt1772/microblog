import { STORAGE_KEY } from '@/config/constants'
import { sanitizePosts } from '@/lib/sanitize'
import type { Post, StorageLike } from '@/types/post'

export interface PostRepositoryOptions {
  /** 注入存储实现；传 `null` 表示强制不可用，缺省时使用全局 localStorage。 */
  storage?: StorageLike | null
  /** 存储键名，缺省为 `microblog.posts.v1`。 */
  key?: string
}

export interface PostRepository {
  /** 当前是否仍在使用真实 localStorage。 */
  readonly available: boolean
  /** 读取并清洗数据；存储异常时返回内存副本（可能为空）。 */
  load(now?: number): Post[]
  /** 写入数据；`false` 表示已降级为内存存储。 */
  save(posts: readonly Post[]): boolean
}

/**
 * LocalStorage 仓储：只负责序列化、读取清洗与异常降级，
 * 不含任何 UI 或业务校验逻辑。
 */
export function createPostRepository(options: PostRepositoryOptions = {}): PostRepository {
  const key = options.key ?? STORAGE_KEY
  let memoryFallback: Post[] = []
  let storageUsable = true

  function resolveStorage(): StorageLike | null {
    if (!storageUsable) return null

    if (options.storage !== undefined) {
      if (!options.storage) storageUsable = false
      return options.storage
    }

    try {
      const api = globalThis.localStorage
      if (!api) {
        storageUsable = false
        return null
      }
      return api
    } catch {
      // 隐私模式下访问 localStorage 本身就可能抛错
      storageUsable = false
      return null
    }
  }

  return {
    get available() {
      return storageUsable
    },

    load(now = Date.now()): Post[] {
      const storage = resolveStorage()
      if (!storage) return sanitizePosts(memoryFallback, { now })

      try {
        const text = storage.getItem(key)
        if (!text) return []
        return sanitizePosts(JSON.parse(text), { now })
      } catch (error) {
        storageUsable = false
        memoryFallback = []
        console.warn('[微语] 本地数据读取失败，本次会话使用临时内存存储。', describeError(error))
        return []
      }
    },

    save(posts: readonly Post[]): boolean {
      const snapshot = posts.map((post) => ({ ...post }))
      const storage = resolveStorage()

      if (!storage) {
        memoryFallback = snapshot
        return false
      }

      try {
        storage.setItem(key, JSON.stringify(snapshot))
        return true
      } catch (error) {
        storageUsable = false
        memoryFallback = snapshot
        console.warn('[微语] 本地存储不可用（隐私模式或空间已满），本次会话使用临时内存存储。', describeError(error))
        return false
      }
    },
  }
}

/** 只提取错误类型，避免把用户内容（可能出现在解析报错信息里）写进日志。 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.name
  return typeof error
}
