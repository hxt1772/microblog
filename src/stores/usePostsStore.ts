import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MAX_ENTRIES, MAX_LENGTH } from '@/config/constants'
import { createId } from '@/lib/id'
import { computeStats } from '@/lib/stats'
import { dateKey } from '@/lib/time'
import { createPostRepository } from '@/services/postRepository'
import type { Post, PublishResult } from '@/types/post'

/**
 * 动态数据唯一的真源：负责水合、发布与时间基准推进。
 * 统计结果由 computed 派生，避免冗余状态不同步。
 */
export const usePostsStore = defineStore('posts', () => {
  const repository = createPostRepository()

  const posts = ref<Post[]>([])
  const hydrated = ref(false)
  const storageAvailable = ref(true)
  /** 统计与相对时间共用的“当前时间”，由 ticker 推进以便跨天重算。 */
  const now = ref(Date.now())

  const stats = computed(() => computeStats(posts.value, now.value))
  const todayKey = computed(() => dateKey(now.value))
  const count = computed(() => posts.value.length)

  function hydrate(at: number = Date.now()): void {
    now.value = at
    posts.value = repository.load(at)
    storageAvailable.value = repository.available
    hydrated.value = true
  }

  function publish(content: string, at: number = Date.now()): PublishResult {
    const trimmed = content.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (content.length > MAX_LENGTH) return { ok: false, reason: 'too-long' }

    const post: Post = { id: createId(), content: trimmed, createdAt: at }
    posts.value = [post, ...posts.value].slice(0, MAX_ENTRIES)
    now.value = at

    const persisted = repository.save(posts.value)
    storageAvailable.value = repository.available

    return { ok: true, post, persisted }
  }

  /** 由 App 的每分钟 ticker 调用，推进基准时间以刷新相对时间与统计。 */
  function syncTicker(at: number = Date.now()): void {
    now.value = at
  }

  return {
    posts,
    hydrated,
    storageAvailable,
    now,
    stats,
    todayKey,
    count,
    hydrate,
    publish,
    syncTicker,
  }
})
