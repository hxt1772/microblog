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

onMounted(async () => {
  await postsStore.hydrate()
  if (!postsStore.apiAvailable) {
    toastStore.show('服务暂时不可用，内容无法加载')
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
      <p>内容保存在服务端内存中，重启服务后会清空。</p>
    </footer>
  </div>

  <ToastHost />
</template>
