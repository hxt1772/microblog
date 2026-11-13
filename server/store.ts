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

/** 互动目标不存在时的错误码，会原样映射到 HTTP 404 的 `error.code`。 */
export type PostNotFoundCode = 'POST_NOT_FOUND'

/** 要操作的动态不存在，携带可映射到 HTTP 404 的错误码与面向用户的中文提示。 */
export class PostNotFoundError extends Error {
  readonly code: PostNotFoundCode = 'POST_NOT_FOUND'

  constructor() {
    super('动态不存在')
    this.name = 'PostNotFoundError'
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
  /** 切换指定动态的点赞状态，返回更新后的副本；不存在时抛 `PostNotFoundError`。 */
  toggleLike(id: string): Post
  /** 切换指定动态的收藏状态，返回更新后的副本；不存在时抛 `PostNotFoundError`。 */
  toggleFavorite(id: string): Post
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

  /** 按 id 取内部记录（含空串），找不到直接抛错，保证调用方不会拿到半成品。 */
  function requirePost(id: string): Post {
    const post = posts.find((item) => item.id === id)
    if (!post) throw new PostNotFoundError()
    return post
  }

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

    toggleLike(id: string): Post {
      const post = requirePost(id)

      // 先翻转我方状态，再按新状态增减总数；取消时用 Math.max 兜底避免负数
      post.liked = !post.liked
      post.likes = Math.max(0, post.likes + (post.liked ? 1 : -1))

      return { ...post }
    },

    toggleFavorite(id: string): Post {
      const post = requirePost(id)

      // 收藏与点赞互不影响，只翻转自身的布尔标记
      post.favorited = !post.favorited

      return { ...post }
    },

    count(): number {
      return posts.length
    },
  }
}
