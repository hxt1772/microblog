/**
 * 一条动态记录，前后端共享的最小领域模型。
 * 点赞 / 收藏同样是单用户演示场景：`liked`、`favorited` 表示“我”的状态，
 * `likes` 是服务端维护的点赞总数，全部由服务端权威返回。
 */
export interface Post {
  id: string
  content: string
  createdAt: number
  /** 点赞总数，非负整数。 */
  likes: number
  /** 当前用户是否已点赞。 */
  liked: boolean
  /** 当前用户是否已收藏。 */
  favorited: boolean
}

/** 发布动态时客户端可提交的字段，`id`、`createdAt` 与互动字段一律由服务端生成。 */
export interface PostInput {
  content: string
}

/** 可切换的互动类型：点赞 / 收藏，均为“再点一次即取消”。 */
export type ReactionKind = 'like' | 'favorite'
