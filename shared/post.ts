/** 一条动态记录，前后端共享的最小领域模型。 */
export interface Post {
  id: string
  content: string
  createdAt: number
}

/** 发布动态时客户端可提交的字段，`id` 与 `createdAt` 一律由服务端生成。 */
export interface PostInput {
  content: string
}
