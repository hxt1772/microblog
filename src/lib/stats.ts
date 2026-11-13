import { WEEK_DAYS } from '@/config/constants'
import type { Post, PostStats } from '@/types/post'
import { buildWeekBuckets, dateKey, startOfDay } from './time'

/** 按字符（码点）计数，emoji 只算 1 个字。 */
export function charLength(text: string): number {
  return Array.from(text).length
}

/** 数字千分位展示，避免不同环境的本地化差异。 */
export function formatMetric(value: number): string {
  try {
    return value.toLocaleString('en-US')
  } catch {
    return String(value)
  }
}

/**
 * 统计看板数据：总条数、累计字数、今日条数、近 7 天分桶。
 * 单次遍历完成聚合，复杂度 O(n)。
 */
export function computeStats(posts: readonly Post[], now: number = Date.now()): PostStats {
  const todayStart = startOfDay(now)
  const days = buildWeekBuckets(now, WEEK_DAYS)
  const buckets = new Map(days.map((day) => [day.key, day]))

  let chars = 0
  let today = 0

  for (const post of posts) {
    chars += charLength(post.content)
    if (post.createdAt >= todayStart) today += 1

    const bucket = buckets.get(dateKey(post.createdAt))
    if (bucket) bucket.count += 1
  }

  const weekTotal = days.reduce((total, day) => total + day.count, 0)

  return {
    total: posts.length,
    chars,
    today,
    weekTotal,
    days,
  }
}
