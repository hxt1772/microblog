import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ENTRIES, MAX_LENGTH, STORAGE_KEY } from '@/config/constants'
import type { Post } from '@/types/post'
import { usePostsStore } from './usePostsStore'

// 2026-11-13（周五）15:30
const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()
const TOMORROW = new Date(2026, 10, 14, 15, 30, 0).getTime()

function seed(posts: Post[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
}

function readStored(): Post[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as Post[]) : []
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('usePostsStore / 初始化与 hydrate', () => {
  it('初始状态为空且未水合', () => {
    const store = usePostsStore()

    expect(store.posts).toEqual([])
    expect(store.hydrated).toBe(false)
    expect(store.stats.total).toBe(0)
    expect(store.stats.days).toHaveLength(7)
  })

  it('从 LocalStorage 恢复并清洗数据', () => {
    seed([
      { id: 'a', content: ' 早些的 ', createdAt: NOW - 60_000 },
      { id: 'b', content: '最新的', createdAt: NOW },
      { id: 'bad', content: '   ', createdAt: NOW },
    ])

    const store = usePostsStore()
    store.hydrate(NOW)

    expect(store.hydrated).toBe(true)
    expect(store.posts.map((post) => post.id)).toEqual(['b', 'a'])
    expect(store.posts[1]?.content).toBe('早些的')
    expect(store.stats.total).toBe(2)
    expect(store.stats.today).toBe(2)
    expect(store.storageAvailable).toBe(true)
  })

  it('存储不可用时仍然可用（内存降级）', () => {
    seed([{ id: 'a', content: '仍在', createdAt: NOW }])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = usePostsStore()
    store.hydrate(NOW)

    expect(store.posts).toEqual([])
    expect(store.storageAvailable).toBe(false)
  })
})

describe('usePostsStore / publish', () => {
  it('发布成功后置顶、更新统计并写入 LocalStorage', () => {
    const store = usePostsStore()
    store.hydrate(NOW)
    store.publish('第一条', NOW - 1000)

    const result = store.publish('第二条', NOW)

    expect(result).toMatchObject({ ok: true, persisted: true })
    expect(store.posts).toHaveLength(2)
    expect(store.posts[0]?.content).toBe('第二条')
    expect(store.stats.total).toBe(2)
    expect(store.stats.today).toBe(2)
    expect(store.stats.chars).toBe(6)
    expect(readStored()).toHaveLength(2)
    expect(readStored()[0]?.content).toBe('第二条')
  })

  it('返回新建的动态，包含 id 与时间戳', () => {
    const store = usePostsStore()
    store.hydrate(NOW)

    const result = store.publish('你好', NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.post.content).toBe('你好')
    expect(result.post.createdAt).toBe(NOW)
    expect(result.post.id).toBeTruthy()
    expect(store.posts[0]).toEqual(result.post)
  })

  it('空白内容被拒绝且不写入', () => {
    const store = usePostsStore()
    store.hydrate(NOW)

    expect(store.publish('   ', NOW)).toEqual({ ok: false, reason: 'empty' })
    expect(store.publish('\n\t', NOW)).toEqual({ ok: false, reason: 'empty' })
    expect(store.posts).toEqual([])
    expect(readStored()).toEqual([])
  })

  it('超过 280 字被拒绝，正好 280 字可通过', () => {
    const store = usePostsStore()
    store.hydrate(NOW)

    expect(store.publish('あ'.repeat(MAX_LENGTH + 1), NOW)).toEqual({ ok: false, reason: 'too-long' })
    expect(store.posts).toEqual([])

    expect(store.publish('あ'.repeat(MAX_LENGTH), NOW).ok).toBe(true)
    expect(store.posts[0]?.content).toHaveLength(MAX_LENGTH)
  })

  it('发布时去除首尾空白', () => {
    const store = usePostsStore()
    store.hydrate(NOW)

    store.publish('  两侧有空格  ', NOW)

    expect(store.posts[0]?.content).toBe('两侧有空格')
  })

  it('最多保留 300 条，超出时丢弃最旧记录', () => {
    const seeded = Array.from({ length: 300 }, (_, index) => ({
      id: `id-${index}`,
      content: `旧内容 ${index}`,
      createdAt: NOW - (index + 1) * 1000,
    }))
    seed(seeded)

    const store = usePostsStore()
    store.hydrate(NOW)
    expect(store.posts).toHaveLength(MAX_ENTRIES)

    store.publish('最新一条', NOW)

    expect(store.posts).toHaveLength(MAX_ENTRIES)
    expect(store.posts[0]?.content).toBe('最新一条')
    expect(store.posts.some((post) => post.id === 'id-299')).toBe(false)
    expect(readStored()).toHaveLength(MAX_ENTRIES)
  })

  it('写入失败时仍保留内存数据并标记存储不可用', () => {
    const store = usePostsStore()
    store.hydrate(NOW)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = store.publish('写不进去也要显示', NOW)

    expect(result).toMatchObject({ ok: true, persisted: false })
    expect(store.posts[0]?.content).toBe('写不进去也要显示')
    expect(store.storageAvailable).toBe(false)
  })
})

describe('usePostsStore / 时间推进', () => {
  it('syncTicker 推进基准时间后今日计数归零', () => {
    const store = usePostsStore()
    store.hydrate(NOW)
    store.publish('今天的动态', NOW)
    expect(store.stats.today).toBe(1)

    store.syncTicker(TOMORROW)

    expect(store.stats.today).toBe(0)
    expect(store.stats.total).toBe(1)
    expect(store.stats.days.at(-1)?.label).toBe('今天')
  })

  it('todayKey 随基准时间变化，可用于跨天检测', () => {
    const store = usePostsStore()
    store.hydrate(NOW)
    expect(store.todayKey).toBe('2026-11-13')

    store.syncTicker(TOMORROW)
    expect(store.todayKey).toBe('2026-11-14')
  })
})
