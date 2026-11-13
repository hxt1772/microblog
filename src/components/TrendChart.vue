<script setup lang="ts">
import { computed } from 'vue'
import { MIN_BAR_PERCENT } from '@/config/constants'
import type { PostStats } from '@/types/post'

const props = defineProps<{
  stats: PostStats
}>()

const EMPTY_LABEL = '近 7 天还没有发布记录'

const hasData = computed(() => props.stats.weekTotal > 0)
const maxCount = computed(() => props.stats.days.reduce((max, day) => Math.max(max, day.count), 0))
const lastIndex = computed(() => props.stats.days.length - 1)

const columns = computed(() =>
  props.stats.days.map((day, index) => ({
    ...day,
    isToday: index === lastIndex.value,
  })),
)

const summaryLabel = computed(
  () =>
    `近 7 天共发布 ${props.stats.weekTotal} 条：${props.stats.days
      .map((day) => `${day.label} ${day.count} 条`)
      .join('，')}`,
)

function barStyle(count: number): Record<string, string> {
  if (count <= 0) return {}
  const percent = Math.max(MIN_BAR_PERCENT, Math.round((count / maxCount.value) * 100))
  return { '--bar': `${percent}%` }
}
</script>

<template>
  <div class="stats__chart">
    <div
      class="chart"
      :class="{ 'is-empty': !hasData }"
      data-testid="trend-chart"
      role="img"
      :aria-label="hasData ? summaryLabel : EMPTY_LABEL"
    >
      <template v-if="hasData">
        <div
          v-for="column in columns"
          :key="column.key"
          class="chart__col"
          :class="{ 'is-today': column.isToday }"
          :title="`${column.label} · ${column.count} 条`"
        >
          <span class="chart__count">{{ column.count > 0 ? column.count : '' }}</span>
          <div class="chart__track">
            <span
              class="chart__bar"
              :class="{ 'is-zero': column.count === 0 }"
              :style="barStyle(column.count)"
            ></span>
          </div>
          <span class="chart__day">{{ column.label }}</span>
        </div>
      </template>
    </div>
    <p class="chart__empty" :class="{ 'is-visible': !hasData }">{{ EMPTY_LABEL }}</p>
  </div>
</template>
