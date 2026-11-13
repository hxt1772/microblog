import { describe, expect, it } from 'vitest'
import { MAX_ENTRIES, MAX_LENGTH } from '@/config/constants'
import { sanitizePosts } from './sanitize'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function sequenceIds(prefix = 'new'): () => string {
  let index = 0
  return () => `${prefix}-${(index += 1)}`
}

describe('sanitizePosts', () => {
  it('非数组输入返回空数组', () => {
    expect(sanitizePosts(null, { now: NOW })).toEqual([])
    expect(sanitizePosts('[]', { now: NOW })).toEqual([])
    expect(sanitizePosts({ length: 1 }, { now: NOW })).toEqual([])
    expect(sanitizePosts(undefined, { now: NOW })).toEqual([])
  })

  it('丢弃非对象、缺少内容与空白内容的条目', () => {
    const raw = [
      null,
      42,
      'text',
      {},
      { content: 123 },
      { content: '   ' },
      { content: '\n\t ' },
      { id: 'keep', content: '留下', createdAt: NOW },
    ]

    expect(sanitizePosts(raw, { now: NOW })).toEqual([
      { id: 'keep', content: '留下', createdAt: NOW, likes: 0, liked: false, favorited: false },
    ])
  })

  it('去除首尾空白', () => {
    const result = sanitizePosts([{ id: 'a', content: '  你好  ', createdAt: NOW }], { now: NOW })

    expect(result[0]?.content).toBe('你好')
  })

  it('超长内容截断到 280 字', () => {
    const long = 'あ'.repeat(MAX_LENGTH + 40)
    const result = sanitizePosts([{ id: 'a', content: long, createdAt: NOW }], { now: NOW })

    expect(result[0]?.content).toHaveLength(MAX_LENGTH)
  })

  it('补齐缺失 id，重复 id 重新生成', () => {
    const createId = sequenceIds()
    const result = sanitizePosts(
      [
        { content: '没有 id', createdAt: NOW },
        { id: 'dup', content: '第一条', createdAt: NOW },
        { id: 'dup', content: '第二条', createdAt: NOW - 1000 },
      ],
      { now: NOW, createId },
    )

    const ids = result.map((item) => item.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain('dup')
    expect(ids).toContain('new-1')
    expect(ids).toContain('new-2')
  })

  it('修正非法时间戳为当前时间', () => {
    const result = sanitizePosts(
      [
        { id: 'nan', content: 'NaN', createdAt: Number.NaN },
        { id: 'zero', content: '0', createdAt: 0 },
        { id: 'negative', content: '负数', createdAt: -10 },
        { id: 'string', content: '字符串', createdAt: 'yesterday' },
        { id: 'infinite', content: '无穷', createdAt: Number.POSITIVE_INFINITY },
      ],
      { now: NOW },
    )

    expect(result.map((item) => item.createdAt)).toEqual([NOW, NOW, NOW, NOW, NOW])
  })

  it('按创建时间倒序排列', () => {
    const result = sanitizePosts(
      [
        { id: 'old', content: '旧', createdAt: NOW - 5000 },
        { id: 'newest', content: '最新', createdAt: NOW },
        { id: 'mid', content: '中', createdAt: NOW - 1000 },
      ],
      { now: NOW },
    )

    expect(result.map((item) => item.id)).toEqual(['newest', 'mid', 'old'])
  })

  it('最多保留最近 300 条', () => {
    const raw = Array.from({ length: MAX_ENTRIES + 20 }, (_, index) => ({
      id: `id-${index}`,
      content: `内容 ${index}`,
      createdAt: NOW - index * 1000,
    }))

    const result = sanitizePosts(raw, { now: NOW })

    expect(result).toHaveLength(MAX_ENTRIES)
    expect(result[0]?.id).toBe('id-0')
    expect(result.at(-1)?.id).toBe(`id-${MAX_ENTRIES - 1}`)
  })

  it('不修改传入的原数组', () => {
    const raw = [{ id: 'a', content: ' 原文 ', createdAt: NOW }]
    const snapshot = JSON.parse(JSON.stringify(raw))

    sanitizePosts(raw, { now: NOW })

    expect(raw).toEqual(snapshot)
  })
})
