<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePostsStore } from '@/stores/usePostsStore'
import EmptyState from './EmptyState.vue'
import PostItem from './PostItem.vue'

/** 信息流的两个视图：全部动态 / 我的收藏。 */
type FeedView = 'all' | 'favorites'

const postsStore = usePostsStore()
const { posts, now, count, hydrated, favorites, favoriteCount } = storeToRefs(postsStore)

const view = ref<FeedView>('all')
const isFavorites = computed(() => view.value === 'favorites')
/** 当前视图要渲染的记录：收藏视图保持原列表顺序。 */
const visiblePosts = computed(() => (isFavorites.value ? favorites.value : posts.value))
</script>

<template>
  <section class="feed" aria-labelledby="feed-title">
    <div class="feed__header">
      <h2 class="feed__title" id="feed-title">最新动态</h2>
      <span class="badge" data-testid="feed-count" aria-live="polite">{{ count }} 条</span>

      <div class="feed__tabs" role="group" aria-label="动态筛选">
        <button
          class="feed__tab"
          :class="{ 'is-active': view === 'all' }"
          data-testid="feed-tab-all"
          type="button"
          :aria-pressed="view === 'all' ? 'true' : 'false'"
          @click="view = 'all'"
        >
          全部
        </button>
        <button
          class="feed__tab"
          :class="{ 'is-active': isFavorites }"
          data-testid="feed-tab-favorites"
          type="button"
          :aria-pressed="isFavorites ? 'true' : 'false'"
          @click="view = 'favorites'"
        >
          收藏
          <span class="feed__tab-count" data-testid="favorites-count">{{ favoriteCount }}</span>
        </button>
      </div>
    </div>

    <p v-if="!hydrated" class="feed__loading" data-testid="feed-loading" role="status">加载中…</p>

    <EmptyState v-else-if="!isFavorites && posts.length === 0" />

    <div v-else-if="isFavorites && favorites.length === 0" class="empty is-visible" data-testid="favorites-empty">
      <div class="empty__art" aria-hidden="true">
        <svg viewBox="0 0 120 90" fill="none">
          <path
            d="M60 70l-4.6-4c-12.4-10.7-20.4-17.6-20.4-26.2 0-6.9 5.4-12.3 12.2-12.3 4.2 0 8 2.1 10.3 5.4 2.3-3.3 6.1-5.4 10.3-5.4 6.8 0 12.2 5.4 12.2 12.3 0 8.6-8 15.5-20.4 26.2L60 70z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <p class="empty__title">还没有收藏内容</p>
      <p class="empty__desc">在动态上点亮星标即可收藏。</p>
    </div>

    <ul v-else class="timeline" data-testid="timeline" aria-live="polite">
      <PostItem v-for="post in visiblePosts" :key="post.id" :post="post" :now="now" />
    </ul>
  </section>
</template>
