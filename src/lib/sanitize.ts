import { MAX_ENTRIES, MAX_LENGTH } from '@/config/constants'
import type { Post } from '@/types/post'
import { createId as defaultCreateId } from './id'

export interface SanitizeOptions {
  /** 用于修正非法时间戳，默认 `Date.now()`。 */
  now?: number
  /** 用于补齐 / 重写 id，默认使用 `createId`。 */
  createId?: () => string
}

/**
 * 清洗本地数据：丢弃脏项、去空白、截断超长内容、补齐或重写 id、
 * 修正非法时间、规范化点赞 / 收藏字段、按时间倒序并裁剪到最近 300 条。不修改入参。
 */
export function sanitizePosts(raw: unknown, options: SanitizeOptions = {}): Post[] {
  if (!Array.isArray(raw)) return []

  const now = options.now ?? Date.now()
  const createId = options.createId ?? defaultCreateId
  const seen = new Set<string>()
  const result: Post[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const content = typeof record.content === 'string' ? record.content.trim().slice(0, MAX_LENGTH) : ''
    if (!content) continue

    const id = resolveId(record.id, seen, createId)
    seen.add(id)

    const parsed = Number(record.createdAt)
    const createdAt = Number.isFinite(parsed) && parsed > 0 ? parsed : now

    result.push({
      id,
      content,
      createdAt,
      likes: normalizeLikes(record.likes),
      liked: record.liked === true,
      favorited: record.favorited === true,
    })
  }

  result.sort((a, b) => b.createdAt - a.createdAt)
  return result.slice(0, MAX_ENTRIES)
}

/** 点赞数兜底：非数字、负数、NaN 一律归零，小数向下取整。 */
function normalizeLikes(raw: unknown): number {
  const parsed = typeof raw === 'number' ? raw : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.floor(parsed)
}

function resolveId(rawId: unknown, seen: Set<string>, createId: () => string): string {
  const candidate = typeof rawId === 'string' ? rawId.trim() : ''
  const preferred = candidate || createId()

  if (!seen.has(preferred)) return preferred

  // id 冲突时最多重试 3 次，仍冲突则追加序号兜底，保证唯一性
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = createId()
    if (!seen.has(next)) return next
  }

  let index = 1
  let fallback = `${preferred}-${index}`
  while (seen.has(fallback)) {
    index += 1
    fallback = `${preferred}-${index}`
  }
  return fallback
}
