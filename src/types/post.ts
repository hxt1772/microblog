import type { Post } from '../../shared/post'

/** 一条动态记录，定义在 `shared/post.ts`，前端仅重导出以保持既有导入路径。 */
export type { Post } from '../../shared/post'

/** 近 7 天趋势图中的一个日期桶。 */
export interface DayBucket {
  key: string
  label: string
  count: number
}

/** 统计看板所需的全部派生数据。 */
export interface PostStats {
  total: number
  chars: number
  today: number
  weekTotal: number
  days: DayBucket[]
}

/** 发布失败原因：本地校验不通过，或服务端暂时不可用。 */
export type PublishFailureReason = 'empty' | 'too-long' | 'unavailable'

/** 发布结果：成功时携带服务端返回的动态，失败时只给出原因。 */
export type PublishResult =
  | { ok: true; post: Post }
  | { ok: false; reason: PublishFailureReason }
