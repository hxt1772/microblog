import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/post'
import { charLength, computeStats, formatMetric } from './stats'

function post(content: string, createdAt: number, id = `id-${createdAt}`): Post {
  return { id, content, createdAt }
}

// 2026-11-13（周五）15:30 作为基准时间
const now = new Date(2026, 10, 13, 15, 30, 0).getTime()

describe('charLength', () => {
  it('按字符（码点）计数，emoji 只算 1 个字', () => {
    expect(charLength('abc')).toBe(3)
    expect(charLength('你好')).toBe(2)
    expect(charLength('hi👍')).toBe(3)
    expect(charLength('')).toBe(0)
  })
})

describe('formatMetric', () => {
  it('使用千分位格式化数字', () => {
    expect(formatMetric(0)).toBe('0')
    expect(formatMetric(1234)).toBe('1,234')
    expect(formatMetric(1234567)).toBe('1,234,567')
  })
})

describe('computeStats', () => {
  it('无数据时返回全零与 7 天空桶', () => {
    const stats = computeStats([], now)

    expect(stats.total).toBe(0)
    expect(stats.chars).toBe(0)
    expect(stats.today).toBe(0)
    expect(stats.weekTotal).toBe(0)
    expect(stats.days).toHaveLength(7)
    expect(stats.days.at(-1)?.label).toBe('今天')
    expect(stats.days.every((day) => day.count === 0)).toBe(true)
  })

  it('近 7 天按自然日分桶，标签为星期，最后一天是今天', () => {
    const stats = computeStats([], now)

    expect(stats.days.map((day) => day.label)).toEqual([
      '周六',
      '周日',
      '周一',
      '周二',
      '周三',
      '周四',
      '今天',
    ])
    expect(stats.days.map((day) => day.key)).toEqual([
      '2026-11-7',
      '2026-11-8',
      '2026-11-9',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ])
  })

  it('统计总量、累计字数、今日条数与本周总数', () => {
    const posts = [
      post('今天第一条', new Date(2026, 10, 13, 9, 0).getTime()),
      post('今天第二条👍', new Date(2026, 10, 13, 14, 0).getTime()),
      post('昨天', new Date(2026, 10, 12, 20, 0).getTime()),
      post('三天前', new Date(2026, 10, 10, 8, 0).getTime()),
      post('七天前已出窗', new Date(2026, 10, 6, 8, 0).getTime()),
    ]

    const stats = computeStats(posts, now)

    expect(stats.total).toBe(5)
    expect(stats.today).toBe(2)
    expect(stats.chars).toBe(5 + 6 + 2 + 3 + 6)
    expect(stats.weekTotal).toBe(4)
    expect(stats.days.map((day) => day.count)).toEqual([0, 0, 0, 1, 0, 1, 2])
  })

  it('今日以自然日 0 点为界，凌晨发布计入今天', () => {
    const stats = computeStats([post('零点整', new Date(2026, 10, 13, 0, 0).getTime())], now)

    expect(stats.today).toBe(1)
    expect(stats.days.at(-1)?.count).toBe(1)
  })

  it('不做数据清洗，仅对传入数组做聚合', () => {
    const stats = computeStats([post('一条', now), post('两条', now)], now)

    expect(stats.total).toBe(2)
    expect(stats.today).toBe(2)
    expect(stats.weekTotal).toBe(2)
  })
})
