<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { BUMP_DURATION_MS } from '@/config/constants'
import { formatMetric } from '@/lib/stats'
import { usePostsStore } from '@/stores/usePostsStore'
import TrendChart from './TrendChart.vue'

const postsStore = usePostsStore()
const { stats } = storeToRefs(postsStore)

const metrics = computed(() => [
  { key: 'total', label: '总动态', unit: '条', value: formatMetric(stats.value.total), testId: 'stat-total' },
  { key: 'chars', label: '累计字数', unit: '字', value: formatMetric(stats.value.chars), testId: 'stat-chars' },
  { key: 'today', label: '今日发布', unit: '条', value: formatMetric(stats.value.today), testId: 'stat-today' },
])

const bumping = ref(false)
let bumpTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => stats.value.total,
  () => {
    bumping.value = true
    if (bumpTimer !== undefined) clearTimeout(bumpTimer)
    bumpTimer = setTimeout(() => {
      bumping.value = false
    }, BUMP_DURATION_MS)
  },
)

onBeforeUnmount(() => {
  if (bumpTimer !== undefined) clearTimeout(bumpTimer)
})
</script>

<template>
  <section class="stats glass" aria-labelledby="stats-title">
    <div class="stats__header">
      <h2 class="stats__title" id="stats-title">统计看板</h2>
      <span class="stats__tag">近 7 天</span>
    </div>

    <dl class="stat-grid">
      <div v-for="metric in metrics" :key="metric.key" class="stat">
        <dt class="stat__label">{{ metric.label }}</dt>
        <dd class="stat__value" :class="{ 'is-bump': bumping }">
          <span :data-testid="metric.testId">{{ metric.value }}</span>
          <span class="stat__unit">{{ metric.unit }}</span>
        </dd>
      </div>
    </dl>

    <TrendChart :stats="stats" />
  </section>
</template>
