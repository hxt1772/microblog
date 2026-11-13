<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { usePostsStore } from '@/stores/usePostsStore'
import EmptyState from './EmptyState.vue'
import PostItem from './PostItem.vue'

const postsStore = usePostsStore()
const { posts, now, count, hydrated } = storeToRefs(postsStore)
</script>

<template>
  <section class="feed" aria-labelledby="feed-title">
    <div class="feed__header">
      <h2 class="feed__title" id="feed-title">最新动态</h2>
      <span class="badge" data-testid="feed-count" aria-live="polite">{{ count }} 条</span>
    </div>

    <p v-if="!hydrated" class="feed__loading" data-testid="feed-loading" role="status">加载中…</p>

    <EmptyState v-else-if="posts.length === 0" />

    <ul v-else class="timeline" data-testid="timeline" aria-live="polite">
      <PostItem v-for="post in posts" :key="post.id" :post="post" :now="now" />
    </ul>
  </section>
</template>
