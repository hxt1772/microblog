import { MAX_ENTRIES, MAX_LENGTH } from '../shared/constants'
import { createId } from '../shared/id'
import type { Post, PostInput } from '../shared/post'

/** 正文校验失败的错误码，会原样映射到 HTTP 400 的 `error.code`。 */
export type PostValidationCode = 'EMPTY_CONTENT' | 'CONTENT_TOO_LONG'

/** 正文校验失败，携带可映射到 HTTP 400 的错误码与面向用户的中文提示。 */
export class PostValidationError extends Error {
  readonly code: PostValidationCode

  constructor(code: PostValidationCode) {
    super(code === 'EMPTY_CONTENT' ? '内容不能为空' : `内容不能超过 ${MAX_LENGTH} 个字符`)
    this.name = 'PostValidationError'
    this.code = code
  }
}

/** 内存存储的可注入依赖，便于测试确定性。 */
export interface PostStoreOptions {
  /** 生成 `createdAt` 的时钟，缺省 `Date.now`。 */
  now?: () => number
  /** 生成 `id` 的工厂，缺省与前端共用的 `createId`。 */
  createId?: () => string
}

/** 动态内存存储接口。 */
export interface PostStore {
  /** 按 `createdAt` 倒序返回副本，最多 `MAX_ENTRIES` 条。 */
  list(): Post[]
  /** 校验并写入一条动态，返回新记录。 */
  add(input: PostInput): Post
  /** 当前记录数。 */
  count(): number
}

/**
 * 创建内存存储：内部数组始终按「新记录在前」维护，
 * 所有操作同步完成，天然满足单进程下的并发一致性。
 */
export function createPostStore(options: PostStoreOptions = {}): PostStore {
  const now = options.now ?? Date.now
  const nextId = options.createId ?? createId
  const posts: Post[] = []

  return {
    list(): Post[] {
      return posts
        .map((post) => ({ ...post }))
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, MAX_ENTRIES)
    },

    add(input: PostInput): Post {
      const content = input.content.trim()

      if (content.length === 0) throw new PostValidationError('EMPTY_CONTENT')
      if (content.length > MAX_LENGTH) throw new PostValidationError('CONTENT_TOO_LONG')

      const post: Post = {
        id: nextId(),
        content,
        createdAt: now(),
        likes: 0,
        liked: false,
        favorited: false,
      }
      posts.unshift(post)

      // 超出上限时丢弃最旧的记录
      if (posts.length > MAX_ENTRIES) posts.length = MAX_ENTRIES

      return { ...post }
    },

    count(): number {
      return posts.length
    },
  }
}
