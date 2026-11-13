// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_LENGTH } from '../shared/constants'
import { POST_EXAMPLES, createSeededStore, shouldSeedExamples, validateExamples } from './seed'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

describe('POST_EXAMPLES', () => {
  it('范例数据自检通过（非空、不超长、不重复、时间合法）', () => {
    expect(validateExamples()).toEqual([])
  })

  it('覆盖「无互动 / 仅点赞 / 仅收藏 / 两者都有」四种组合', () => {
    const combinations = new Set(
      POST_EXAMPLES.map((example) => `${example.liked === true}/${example.favorited === true}`),
    )

    expect(combinations).toEqual(new Set(['false/false', 'true/false', 'false/true', 'true/true']))
  })

  it('正文长度都在限制内，且时间偏移不重复', () => {
    for (const example of POST_EXAMPLES) {
      expect(example.content.trim().length).toBeGreaterThan(0)
      expect(example.content.length).toBeLessThanOrEqual(MAX_LENGTH)
    }

    expect(new Set(POST_EXAMPLES.map((example) => example.agoMs)).size).toBe(POST_EXAMPLES.length)
  })

  it('自检能发现非法范例', () => {
    expect(validateExamples([{ content: '   ', agoMs: 1000 }])).toHaveLength(1)
    expect(validateExamples([{ content: '重复', agoMs: 1000 }, { content: ' 重复 ', agoMs: 2000 }])).toEqual([
      '第 2 条正文重复',
    ])
    expect(validateExamples([{ content: '超长', agoMs: 0 }])).toEqual(['第 1 条时间偏移不合法'])
  })
})

describe('shouldSeedExamples', () => {
  it('默认注入，显式设置 SEED_EXAMPLES=0 时关闭', () => {
    expect(shouldSeedExamples({})).toBe(true)
    expect(shouldSeedExamples({ SEED_EXAMPLES: '1' })).toBe(true)
    expect(shouldSeedExamples({ SEED_EXAMPLES: '0' })).toBe(false)
  })
})

describe('createSeededStore', () => {
  it('写入全部范例并按发布时间倒序返回', () => {
    const store = createSeededStore(NOW)
    const posts = store.list()

    expect(store.count()).toBe(POST_EXAMPLES.length)
    expect(posts).toHaveLength(POST_EXAMPLES.length)

    const newestFirst = [...POST_EXAMPLES].sort((left, right) => left.agoMs - right.agoMs)
    expect(posts.map((post) => post.content)).toEqual(newestFirst.map((example) => example.content))
  })

  it('按范例声明的互动状态初始化点赞与收藏', () => {
    const store = createSeededStore(NOW)

    for (const example of POST_EXAMPLES) {
      const post = store.list().find((item) => item.content === example.content)
      expect(post).toBeDefined()
      if (!post) continue

      expect(post.liked).toBe(example.liked === true)
      expect(post.favorited).toBe(example.favorited === true)
      // 单用户语义下点赞总数与 liked 始终一致
      expect(post.likes).toBe(example.liked === true ? 1 : 0)
    }
  })

  it('时间戳落在 [now - 7 天, now] 区间内', () => {
    const store = createSeededStore(NOW)
    const sevenDays = 7 * 24 * 60 * 60 * 1000

    for (const post of store.list()) {
      expect(post.createdAt).toBeLessThanOrEqual(NOW)
      expect(post.createdAt).toBeGreaterThan(NOW - sevenDays)
    }
  })

  it('每个存储实例相互独立，互不影响', () => {
    const first = createSeededStore(NOW)
    const second = createSeededStore(NOW)
    const idle = first.list().find((post) => !post.liked && !post.favorited)

    expect(idle).toBeDefined()
    if (!idle) return

    first.toggleLike(idle.id)
    first.toggleFavorite(idle.id)

    expect(first.list().find((post) => post.id === idle.id)).toMatchObject({
      likes: 1,
      liked: true,
      favorited: true,
    })
    // 两个实例的 id 各自生成，按正文定位同一条范例即可
    expect(second.list().find((post) => post.content === idle.content)).toMatchObject({
      likes: 0,
      liked: false,
      favorited: false,
    })
  })
})
