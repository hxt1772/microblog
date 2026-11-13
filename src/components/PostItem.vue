<script setup lang="ts">
import { computed } from 'vue'
import { formatRelativeTime } from '@/lib/time'
import { usePostsStore } from '@/stores/usePostsStore'
import { useToastStore } from '@/stores/useToastStore'
import type { Post } from '@/types/post'

const props = defineProps<{
  post: Post
  /** 当前时间基准，由父级统一推进，保证整页相对时间一致。 */
  now: number
}>()

const postsStore = usePostsStore()
const toastStore = useToastStore()

const displayTime = computed(() => formatRelativeTime(props.post.createdAt, props.now))
const isoTime = computed(() => new Date(props.post.createdAt).toISOString())
/** 同一 id 的互动请求未返回时，点赞与收藏一并禁用，避免连点造成状态错乱。 */
const pending = computed(() => postsStore.isPending(props.post.id))

const likeLabel = computed(() => (props.post.liked ? '取消点赞' : '点赞'))
const favoriteLabel = computed(() => (props.post.favorited ? '取消收藏' : '收藏'))

/**
 * 统一的互动入口：成功后不做全局提示，界面状态变化即为反馈；
 * 失败时仅提示服务不可用，记录本身保持不变。
 */
async function react(action: () => Promise<boolean>): Promise<void> {
  if (pending.value) return

  const ok = await action()
  if (!ok) toastStore.show('操作失败，服务暂时不可用')
}

function handleLike(): Promise<void> {
  return react(() => postsStore.toggleLike(props.post.id))
}

function handleFavorite(): Promise<void> {
  return react(() => postsStore.toggleFavorite(props.post.id))
}
</script>

<template>
  <li class="post" data-testid="post-item" :data-post-id="post.id">
    <div class="post__head">
      <span class="post__avatar" aria-hidden="true">我</span>
      <div class="post__meta">
        <span class="post__author">我</span>
        <time class="post__time" :datetime="isoTime">{{ displayTime }}</time>
      </div>
    </div>
    <p class="post__content">{{ post.content }}</p>

    <div class="post__actions">
      <button
        class="post__action"
        :class="{ 'is-active': post.liked }"
        data-testid="like-button"
        type="button"
        :aria-pressed="post.liked ? 'true' : 'false'"
        :aria-label="likeLabel"
        :disabled="pending"
        @click="handleLike"
      >
        <span class="post__action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z" />
          </svg>
        </span>
        <span class="post__action-count" data-testid="like-count">{{ post.likes }}</span>
      </button>

      <button
        class="post__action"
        :class="{ 'is-active': post.favorited }"
        data-testid="favorite-button"
        type="button"
        :aria-pressed="post.favorited ? 'true' : 'false'"
        :aria-label="favoriteLabel"
        :disabled="pending"
        @click="handleFavorite"
      >
        <span class="post__action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 10.2l5.4-.8z" />
          </svg>
        </span>
      </button>
    </div>
  </li>
</template>
