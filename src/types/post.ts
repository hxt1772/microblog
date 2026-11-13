/** 一条动态记录，也是 LocalStorage 中持久化的最小单元。 */
export interface Post {
  id: string
  content: string
  createdAt: number
}

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

/** 仅依赖 localStorage 的最小接口，便于测试注入替身。 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 发布结果，用于区分成功、校验失败与降级落盘。 */
export type PublishFailureReason = 'empty' | 'too-long'

export type PublishResult =
  | { ok: true; post: Post; persisted: boolean }
  | { ok: false; reason: PublishFailureReason }
