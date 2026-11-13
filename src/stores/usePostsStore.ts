import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MAX_ENTRIES, MAX_LENGTH } from '@/config/constants'
import { computeStats } from '@/lib/stats'
import { dateKey } from '@/lib/time'
import { PostApiError, createPostApi } from '@/services/postApi'
import type { Post, PublishResult } from '@/types/post'

/**
 * 动态数据唯一的真源：负责水合、发布与时间基准推进。
 * 数据读写全部走 REST 接口，统计结果由 computed 派生，避免冗余状态不同步。
 */
export const usePostsStore = defineStore('posts', () => {
  // fetch 实现在每次请求时才解析，测试可直接 stub 全局 fetch
  const api = createPostApi()

  const posts = ref<Post[]>([])
  const hydrated = ref(false)
  const loading = ref(false)
  /** 最近一次请求是否成功，用于提示服务不可用。 */
  const apiAvailable = ref(true)
  /** 统计与相对时间共用的“当前时间”，由 ticker 推进以便跨天重算。 */
  const now = ref(Date.now())
  /** 互动请求飞行中的动态 id，同一 id 不允许并发点击，也用于禁用按钮。 */
  const pendingIds = ref<Set<string>>(new Set())

  const stats = computed(() => computeStats(posts.value, now.value))
  const todayKey = computed(() => dateKey(now.value))
  const count = computed(() => posts.value.length)
  const favorites = computed(() => posts.value.filter((post) => post.favorited === true))
  const favoriteCount = computed(() => favorites.value.length)

  /** 从服务端拉取列表；失败时降级为空列表并标记服务不可用。 */
  async function hydrate(at: number = Date.now()): Promise<void> {
    now.value = at
    hydrated.value = false
    loading.value = true

    try {
      posts.value = await api.list()
      apiAvailable.value = true
    } catch {
      posts.value = []
      apiAvailable.value = false
    } finally {
      hydrated.value = true
      loading.value = false
      // 列表已整体替换，旧的 pending 记录不再对应任何可见行
      pendingIds.value.clear()
    }
  }

  /**
   * 发布一条动态：先做与服务端一致的本地校验，再以服务端返回的记录为准。
   * 不允许乐观插入，失败时列表保持不变。
   */
  async function publish(content: string, at: number = Date.now()): Promise<PublishResult> {
    const trimmed = content.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (content.length > MAX_LENGTH) return { ok: false, reason: 'too-long' }

    try {
      const post = await api.create(trimmed)
      posts.value = [post, ...posts.value].slice(0, MAX_ENTRIES)
      now.value = at
      apiAvailable.value = true

      return { ok: true, post }
    } catch (error) {
      if (error instanceof PostApiError) {
        if (error.code === 'EMPTY_CONTENT') return { ok: false, reason: 'empty' }
        if (error.code === 'CONTENT_TOO_LONG') return { ok: false, reason: 'too-long' }
      }

      apiAvailable.value = false
      return { ok: false, reason: 'unavailable' }
    }
  }

  /** 该 id 是否有互动请求在飞行中，供按钮禁用与去重判断。 */
  function isPending(id: string): boolean {
    return pendingIds.value.has(id)
  }

  /**
   * 点赞 / 收藏共用的切换流程：不做乐观更新，
   * 成功后用服务端记录原位替换（保持列表顺序），失败时只标记服务不可用、列表不变。
   * 同一 id 请求飞行中时再次触发直接返回 false，不重复发请求。
   */
  async function toggleReaction(
    id: string,
    request: (target: string) => Promise<Post>,
  ): Promise<boolean> {
    if (pendingIds.value.has(id)) return false

    pendingIds.value.add(id)
    try {
      const post = await request(id)
      const index = posts.value.findIndex((item) => item.id === id)
      if (index >= 0) posts.value[index] = post
      apiAvailable.value = true
      return true
    } catch {
      apiAvailable.value = false
      return false
    } finally {
      pendingIds.value.delete(id)
    }
  }

  function toggleLike(id: string): Promise<boolean> {
    return toggleReaction(id, (target) => api.toggleLike(target))
  }

  function toggleFavorite(id: string): Promise<boolean> {
    return toggleReaction(id, (target) => api.toggleFavorite(target))
  }

  /** 由 App 的每分钟 ticker 调用，推进基准时间以刷新相对时间与统计。 */
  function syncTicker(at: number = Date.now()): void {
    now.value = at
  }

  return {
    posts,
    hydrated,
    loading,
    apiAvailable,
    now,
    pendingIds,
    stats,
    todayKey,
    count,
    favorites,
    favoriteCount,
    hydrate,
    publish,
    isPending,
    toggleLike,
    toggleFavorite,
    syncTicker,
  }
})
