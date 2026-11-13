import type { DayBucket } from '@/types/post'

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 数字补零到两位。 */
export function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 返回指定时间所在自然日的 0 点时间戳。 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** 自然日键，用于统计分桶，例如 `2026-11-13`。 */
export function dateKey(input: number | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** 星期标签，周日为 `周日`。 */
export function weekdayLabel(input: number | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  return WEEKDAY_LABELS[date.getDay()] ?? '周日'
}

/**
 * 相对时间展示：刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / M月D日 HH:mm / YYYY年M月D日。
 * `now` 显式传入，便于测试与跨天刷新复用同一基准。
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp)

  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`

  const date = new Date(timestamp)
  const today = new Date(now)
  const todayStart = startOfDay(now)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (timestamp >= todayStart) return `今天 ${clock}`
  if (timestamp >= todayStart - DAY) return `昨天 ${clock}`
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

/** 近 7 天的日期桶骨架，最后一项为今天。 */
export function buildWeekBuckets(now: number, days: number): DayBucket[] {
  const base = new Date(now)
  const buckets: DayBucket[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset)
    buckets.push({
      key: dateKey(day),
      label: offset === 0 ? '今天' : weekdayLabel(day),
      count: 0,
    })
  }

  return buckets
}
