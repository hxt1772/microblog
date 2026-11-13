<script setup lang="ts">
import { computed } from 'vue'
import { formatRelativeTime } from '@/lib/time'
import type { Post } from '@/types/post'

const props = defineProps<{
  post: Post
  /** 当前时间基准，由父级统一推进，保证整页相对时间一致。 */
  now: number
}>()

const displayTime = computed(() => formatRelativeTime(props.post.createdAt, props.now))
const isoTime = computed(() => new Date(props.post.createdAt).toISOString())
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
  </li>
</template>
