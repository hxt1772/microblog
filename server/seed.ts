import { MAX_LENGTH } from '../shared/constants'
import { createPostStore } from './store'
import type { PostStore } from './store'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 一条演示范例：内容 + 距今多久发布 + 期望的初始互动状态。 */
export interface PostExample {
  /** 正文，必须非空且不超过 `MAX_LENGTH`。 */
  content: string
  /** 距今多少毫秒发布，数值越大越旧。 */
  agoMs: number
  /** 预置为「我」已点赞。 */
  liked?: boolean
  /** 预置为「我」已收藏。 */
  favorited?: boolean
}

/**
 * 启动时预置的范例动态：覆盖「无互动 / 仅点赞 / 仅收藏 / 两者都有」四种组合，
 * 并铺满近 7 天，让统计看板与趋势图开箱就有内容。
 */
export const POST_EXAMPLES: readonly PostExample[] = [
  { content: '早上给窗台的绿萝换了水，新叶比上周大了一圈。', agoMs: 12 * MINUTE, liked: true },
  { content: '把桌面的便签清掉，只留今天必须完成的三件事。', agoMs: 3 * HOUR },
  {
    content: '路过河边时闻到桂花味，秋天真的来了。',
    agoMs: 6 * HOUR,
    liked: true,
    favorited: true,
  },
  { content: '番茄牛腩炖了两个小时，入口即化，值回等待。', agoMs: 26 * HOUR },
  {
    content: '读完一本书最好的状态，是合上时想立刻讲给别人听。',
    agoMs: 30 * HOUR,
    favorited: true,
  },
  { content: '周末爬了城郊的小山，山顶的风比想象中冷。', agoMs: 2 * DAY, liked: true },
  { content: '把常用快捷键写在便签上贴显示器，一周形成肌肉记忆。', agoMs: 3 * DAY },
  { content: '下雨天适合整理相册，翻到很多忘了拍过的照片。', agoMs: 4 * DAY, favorited: true },
  {
    content: '给自己定个小目标：每天写一百字，不追求完美。',
    agoMs: 5 * DAY,
    liked: true,
    favorited: true,
  },
  { content: '睡前把手机放到客厅，第二天的早晨会宽松很多。', agoMs: 6 * DAY + 2 * HOUR },
]

/** 环境变量开关：`SEED_EXAMPLES=0` 时启动不再注入范例数据。 */
export function shouldSeedExamples(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEED_EXAMPLES !== '0'
}

/**
 * 创建内存存储并写入范例动态。
 * 先按「最早 → 最新」写入，保证内部顺序与真实发布一致；互动状态在写入后切换，
 * 因此 `likes` 与 `liked` 始终由 store 自身维护，不需要伪造字段。
 */
export function createSeededStore(now: number = Date.now()): PostStore {
  let current = now
  const store = createPostStore({ now: () => current })

  for (const example of [...POST_EXAMPLES].sort((left, right) => right.agoMs - left.agoMs)) {
    current = now - example.agoMs
    const post = store.add({ content: example.content })
    if (example.liked) store.toggleLike(post.id)
    if (example.favorited) store.toggleFavorite(post.id)
  }

  return store
}

/** 范例数据自检：正文合法且不重复，便于在测试与启动时兜底。 */
export function validateExamples(examples: readonly PostExample[] = POST_EXAMPLES): string[] {
  const problems: string[] = []
  const seen = new Set<string>()

  for (const [index, example] of examples.entries()) {
    const content = example.content.trim()

    if (content.length === 0) problems.push(`第 ${index + 1} 条正文为空`)
    if (content.length > MAX_LENGTH) problems.push(`第 ${index + 1} 条正文超过 ${MAX_LENGTH} 字`)
    if (seen.has(content)) problems.push(`第 ${index + 1} 条正文重复`)
    if (!Number.isFinite(example.agoMs) || example.agoMs <= 0) {
      problems.push(`第 ${index + 1} 条时间偏移不合法`)
    }

    seen.add(content)
  }

  return problems
}
