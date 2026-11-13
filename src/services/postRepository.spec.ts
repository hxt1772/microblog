import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from '@/config/constants'
import type { Post, StorageLike } from '@/types/post'
import { createPostRepository } from './postRepository'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function post(content: string, createdAt: number, id = `id-${createdAt}`): Post {
  return { id, content, createdAt }
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('createPostRepository / load', () => {
  it('键不存在时返回空数组', () => {
    const repository = createPostRepository({ storage: createMemoryStorage() })

    expect(repository.load(NOW)).toEqual([])
    expect(repository.available).toBe(true)
  })

  it('读取合法数组并清洗排序', () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify([
        { id: 'a', content: ' 较早 ', createdAt: NOW - 1000 },
        { id: 'b', content: '较新', createdAt: NOW },
        { content: '   ' },
      ]),
    })

    const repository = createPostRepository({ storage })

    expect(repository.load(NOW)).toEqual([
      { id: 'b', content: '较新', createdAt: NOW },
      { id: 'a', content: '较早', createdAt: NOW - 1000 },
    ])
  })

  it('JSON 畸形时降级：返回空数组、标记不可用并告警', () => {
    const repository = createPostRepository({ storage: createMemoryStorage({ [STORAGE_KEY]: '{oops' }) })

    expect(repository.load(NOW)).toEqual([])
    expect(repository.available).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('getItem 抛错时降级且不向外抛异常', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    const repository = createPostRepository({ storage })

    expect(() => repository.load(NOW)).not.toThrow()
    expect(repository.load(NOW)).toEqual([])
    expect(repository.available).toBe(false)
  })

  it('读取失败后不输出用户内容到告警信息', () => {
    const repository = createPostRepository({
      storage: createMemoryStorage({ [STORAGE_KEY]: '{"content":"机密内容"' }),
    })

    repository.load(NOW)

    const logged = warnSpy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('机密内容')
  })
})

describe('createPostRepository / save', () => {
  it('写入成功后返回 true 并序列化到存储', () => {
    const storage = createMemoryStorage()
    const repository = createPostRepository({ storage })
    const posts = [post('你好', NOW)]

    expect(repository.save(posts)).toBe(true)
    expect(JSON.parse(storage.data.get(STORAGE_KEY) ?? '[]')).toEqual(posts)
  })

  it('配额异常时返回 false、标记不可用并改用内存副本', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const repository = createPostRepository({ storage })
    const posts = [post('保存失败也要留住', NOW)]

    expect(repository.save(posts)).toBe(false)
    expect(repository.available).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    expect(repository.load(NOW)).toEqual(posts)
  })

  it('存储不可用时直接写入内存副本', () => {
    const repository = createPostRepository({ storage: null })
    const posts = [post('内存里的内容', NOW)]

    expect(repository.save(posts)).toBe(false)
    expect(repository.load(NOW)).toEqual(posts)
  })

  it('保存的是快照，外部数组后续变更不影响已存内容', () => {
    const repository = createPostRepository({ storage: null })
    const posts = [post('原始', NOW)]

    repository.save(posts)
    posts.push(post('追加', NOW + 1000))

    expect(repository.load(NOW)).toHaveLength(1)
  })

  it('默认从全局 localStorage 读取，缺失时降级', () => {
    vi.stubGlobal('localStorage', undefined)
    const repository = createPostRepository()

    expect(repository.load(NOW)).toEqual([])
    expect(repository.save([post('降级', NOW)])).toBe(false)
    expect(repository.load(NOW)).toEqual([post('降级', NOW)])

    vi.unstubAllGlobals()
  })
})
