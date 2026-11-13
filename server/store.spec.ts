// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_ENTRIES, MAX_LENGTH } from '../shared/constants'
import { PostValidationError, createPostStore } from './store'

/** 返回依次递增的时钟，便于断言插入顺序。 */
function createClock(start = 1_700_000_000_000): () => number {
  let current = start
  return () => {
    current += 1000
    return current
  }
}

/** 返回可预测的 id 生成器。 */
function createIdGenerator(): () => string {
  let seq = 0
  return () => {
    seq += 1
    return `id-${seq}`
  }
}

/** 捕获校验错误，便于断言 error code。 */
function catchValidationError(run: () => void): PostValidationError {
  try {
    run()
  } catch (error) {
    if (error instanceof PostValidationError) return error
    throw error
  }
  throw new Error('预期抛出 PostValidationError，但调用正常返回')
}

describe('createPostStore', () => {
  it('add 去掉正文首尾空白后保存', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })

    const post = store.add({ content: '  今天风很大  ' })

    expect(post.content).toBe('今天风很大')
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0]?.content).toBe('今天风很大')
  })

  it('空字符串抛出 EMPTY_CONTENT', () => {
    const store = createPostStore()
    const error = catchValidationError(() => store.add({ content: '' }))

    expect(error.code).toBe('EMPTY_CONTENT')
    // 面向用户的中文提示，不允许为空
    expect(error.message.length).toBeGreaterThan(0)
    expect(store.count()).toBe(0)
  })

  it('全空白正文抛出 EMPTY_CONTENT', () => {
    const store = createPostStore()
    const error = catchValidationError(() => store.add({ content: '   \n\t  ' }))

    expect(error.code).toBe('EMPTY_CONTENT')
    expect(store.count()).toBe(0)
  })

  it('恰好 MAX_LENGTH 个字符可以通过（首尾空白先被裁剪）', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })

    const post = store.add({ content: `  ${'a'.repeat(MAX_LENGTH)}  ` })

    expect(post.content).toHaveLength(MAX_LENGTH)
    expect(store.count()).toBe(1)
  })

  it('超过 MAX_LENGTH 个字符抛出 CONTENT_TOO_LONG', () => {
    const store = createPostStore()
    const error = catchValidationError(() => store.add({ content: 'a'.repeat(MAX_LENGTH + 1) }))

    expect(error.code).toBe('CONTENT_TOO_LONG')
    expect(store.count()).toBe(0)
  })

  it('list 按 createdAt 倒序返回', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })
    store.add({ content: '第一条' })
    store.add({ content: '第二条' })
    store.add({ content: '第三条' })

    expect(store.list().map((post) => post.content)).toEqual(['第三条', '第二条', '第一条'])
  })

  it('超过 MAX_ENTRIES 时丢弃最旧的记录', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })

    for (let index = 0; index < MAX_ENTRIES + 5; index += 1) {
      store.add({ content: `第 ${index} 条` })
    }

    const posts = store.list()
    expect(posts).toHaveLength(MAX_ENTRIES)
    expect(store.count()).toBe(MAX_ENTRIES)
    expect(posts[0]?.content).toBe(`第 ${MAX_ENTRIES + 4} 条`)
    // 最旧的 5 条已被裁剪
    expect(posts.map((post) => post.content)).not.toContain('第 0 条')
    expect(posts.at(-1)?.content).toBe('第 5 条')
  })

  it('使用注入的 now 与 createId 生成字段', () => {
    const store = createPostStore({ now: () => 42, createId: () => 'fixed-id' })

    const post = store.add({ content: '确定性' })

    expect(post).toEqual({ id: 'fixed-id', content: '确定性', createdAt: 42 })
  })

  it('list 返回副本，调用方修改不影响内部状态', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })
    store.add({ content: '原始内容' })

    const snapshot = store.list()
    snapshot.push({ id: 'x', content: '外部塞入', createdAt: 0 })
    const first = snapshot[0]
    if (first) first.content = '被篡改'

    expect(store.count()).toBe(1)
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0]?.content).toBe('原始内容')
  })

  it('count 返回当前记录数', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })

    expect(store.count()).toBe(0)
    store.add({ content: '一' })
    store.add({ content: '二' })
    expect(store.count()).toBe(2)
  })
})
