import { describe, expect, it } from 'vitest'
import { dateKey, formatRelativeTime, pad, startOfDay } from './time'

describe('pad', () => {
  it('个位数补零，两位数原样返回', () => {
    expect(pad(0)).toBe('00')
    expect(pad(9)).toBe('09')
    expect(pad(12)).toBe('12')
  })
})

describe('startOfDay', () => {
  it('返回同一自然日的 0 点时间戳', () => {
    const afternoon = new Date(2026, 10, 13, 15, 30, 12).getTime()
    const start = new Date(startOfDay(afternoon))

    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(10)
    expect(start.getDate()).toBe(13)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
  })
})

describe('dateKey', () => {
  it('生成按自然日可比较的键', () => {
    expect(dateKey(new Date(2026, 10, 13, 23, 59).getTime())).toBe('2026-11-13')
    expect(dateKey(new Date(2026, 0, 5).getTime())).toBe('2026-1-5')
  })
})

describe('formatRelativeTime', () => {
  // 2026-11-13（周五）15:30 作为基准时间
  const now = new Date(2026, 10, 13, 15, 30, 0).getTime()

  it('一分钟内显示「刚刚」', () => {
    expect(formatRelativeTime(now, now)).toBe('刚刚')
    expect(formatRelativeTime(now - 59 * 1000, now)).toBe('刚刚')
  })

  it('一小时内显示「N 分钟前」', () => {
    expect(formatRelativeTime(now - 60 * 1000, now)).toBe('1 分钟前')
    expect(formatRelativeTime(now - 42 * 60 * 1000, now)).toBe('42 分钟前')
  })

  it('当天的更早时间显示「今天 HH:mm」', () => {
    expect(formatRelativeTime(new Date(2026, 10, 13, 9, 5).getTime(), now)).toBe('今天 09:05')
    expect(formatRelativeTime(new Date(2026, 10, 13, 0, 0).getTime(), now)).toBe('今天 00:00')
  })

  it('昨天的记录显示「昨天 HH:mm」', () => {
    expect(formatRelativeTime(new Date(2026, 10, 12, 20, 7).getTime(), now)).toBe('昨天 20:07')
    expect(formatRelativeTime(new Date(2026, 10, 12, 0, 0).getTime(), now)).toBe('昨天 00:00')
  })

  it('同年的更早日期显示「M月D日 HH:mm」', () => {
    expect(formatRelativeTime(new Date(2026, 10, 10, 9, 5).getTime(), now)).toBe('11月10日 09:05')
    expect(formatRelativeTime(new Date(2026, 0, 1, 8, 0).getTime(), now)).toBe('1月1日 08:00')
  })

  it('跨年日期只显示年月日', () => {
    expect(formatRelativeTime(new Date(2025, 11, 31, 23, 59).getTime(), now)).toBe('2025年12月31日')
  })

  it('未来时间按「刚刚」处理，不出现负数', () => {
    expect(formatRelativeTime(now + 5 * 60 * 1000, now)).toBe('刚刚')
  })
})
