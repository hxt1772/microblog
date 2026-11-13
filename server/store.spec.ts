// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_ENTRIES, MAX_LENGTH } from '../shared/constants'
import { PostNotFoundError, PostValidationError, createPostStore } from './store'

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

/** 捕获「动态不存在」错误，便于断言 name / code / message。 */
function catchNotFoundError(run: () => void): PostNotFoundError {
  try {
    run()
  } catch (error) {
    if (error instanceof PostNotFoundError) return error
    throw error
  }
  throw new Error('预期抛出 PostNotFoundError，但调用正常返回')
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

    expect(post).toEqual({
      id: 'fixed-id',
      content: '确定性',
      createdAt: 42,
      likes: 0,
      liked: false,
      favorited: false,
    })
  })

  it('list 返回副本，调用方修改不影响内部状态', () => {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })
    store.add({ content: '原始内容' })

    const snapshot = store.list()
    snapshot.push({ id: 'x', content: '外部塞入', createdAt: 0, likes: 0, liked: false, favorited: false })
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

describe('createPostStore 互动切换', () => {
  /** 建一个只有一条动态的 store，返回 id 便于后续操作。 */
  function setup(): { store: ReturnType<typeof createPostStore>; id: string } {
    const store = createPostStore({ now: createClock(), createId: createIdGenerator() })
    const post = store.add({ content: '待互动' })
    return { store, id: post.id }
  }

  it('首次 toggleLike 让 likes 加一并置 liked 为 true', () => {
    const { store, id } = setup()

    const post = store.toggleLike(id)

    expect(post.likes).toBe(1)
    expect(post.liked).toBe(true)
    expect(store.list()[0]?.likes).toBe(1)
    expect(store.list()[0]?.liked).toBe(true)
  })

  it('再次 toggleLike 取消点赞，likes 回到 0 且不为负', () => {
    const { store, id } = setup()

    store.toggleLike(id)
    const post = store.toggleLike(id)

    expect(post.likes).toBe(0)
    expect(post.liked).toBe(false)
  })

  it('多次来回切换后 likes 始终非负', () => {
    const { store, id } = setup()

    for (let round = 0; round < 3; round += 1) {
      expect(store.toggleLike(id).likes).toBe(1)
      expect(store.toggleLike(id).likes).toBe(0)
    }

    expect(store.list()[0]?.likes).toBe(0)
  })

  it('toggleFavorite 只切换 favorited，不影响点赞状态', () => {
    const { store, id } = setup()

    const favorited = store.toggleFavorite(id)

    expect(favorited.favorited).toBe(true)
    expect(favorited.likes).toBe(0)
    expect(favorited.liked).toBe(false)

    const cancelled = store.toggleFavorite(id)

    expect(cancelled.favorited).toBe(false)
    expect(cancelled.likes).toBe(0)
    expect(cancelled.liked).toBe(false)
  })

  it('点赞与收藏互不干扰', () => {
    const { store, id } = setup()

    store.toggleLike(id)
    store.toggleFavorite(id)
    const post = store.toggleLike(id)

    expect(post.liked).toBe(false)
    expect(post.likes).toBe(0)
    expect(post.favorited).toBe(true)
  })

  it('未知 id 抛 PostNotFoundError 且不改变内部状态', () => {
    const { store } = setup()
    const before = store.list()

    for (const run of [() => store.toggleLike('missing'), () => store.toggleFavorite('missing')]) {
      const error = catchNotFoundError(run)

      expect(error.name).toBe('PostNotFoundError')
      expect(error.code).toBe('POST_NOT_FOUND')
      expect(error.message.length).toBeGreaterThan(0)
    }

    expect(store.count()).toBe(1)
    expect(store.list()).toEqual(before)
  })

  it('toggle 返回副本，外部修改不影响内部状态', () => {
    const { store, id } = setup()

    const liked = store.toggleLike(id)
    liked.likes = 999
    liked.content = '被篡改'

    const favorited = store.toggleFavorite(id)
    favorited.favorited = false

    const current = store.list()[0]
    expect(current?.likes).toBe(1)
    expect(current?.content).toBe('待互动')
    expect(current?.favorited).toBe(true)
  })
})
