<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import PostComposer from './components/PostComposer.vue'
import PostFeed from './components/PostFeed.vue'
import SceneBackground from './components/SceneBackground.vue'
import StatsBoard from './components/StatsBoard.vue'
import ToastHost from './components/ToastHost.vue'
import { useRelativeTimeTicker } from './composables/useRelativeTimeTicker'
import { usePostsStore } from './stores/usePostsStore'
import { useToastStore } from './stores/useToastStore'

const postsStore = usePostsStore()
const toastStore = useToastStore()

onMounted(() => {
  postsStore.hydrate()
  if (!postsStore.storageAvailable) {
    toastStore.show('本地存储不可用，当前内容仅保存在内存中')
  }
})

// 全页唯一的计时器：既刷新相对时间，也负责跨天统计重算
useRelativeTimeTicker(() => {
  postsStore.syncTicker()
})
</script>

<template>
  <SceneBackground />

  <div class="page">
    <AppHeader />

    <main>
      <PostComposer />
      <StatsBoard />
      <PostFeed />
    </main>

    <footer class="footer">
      <p>数据保存在本地浏览器，清空浏览器数据后会丢失。</p>
    </footer>
  </div>

  <ToastHost />
</template>
