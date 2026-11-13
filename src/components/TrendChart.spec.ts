import { describe, expect, it } from 'vitest'
import { computeStats } from '@/lib/stats'
import { mountWithPinia } from '@/test-utils/mount'
import type { Post } from '@/types/post'
import TrendChart from './TrendChart.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function statsFor(posts: Post[]) {
  return computeStats(posts, NOW)
}

function makePost(content: string, createdAt: number, id = `id-${createdAt}-${content}`): Post {
  return { id, content, createdAt }
}

describe('TrendChart', () => {
  it('无数据时展示空状态并给出无障碍说明', () => {
    const wrapper = mountChart(statsFor([]))

    expect(wrapper.find('.chart').classes()).toContain('is-empty')
    expect(wrapper.find('.chart').attributes('aria-label')).toBe('近 7 天还没有发布记录')
    expect(wrapper.find('.chart__empty').classes()).toContain('is-visible')
    expect(wrapper.find('.chart__empty').text()).toBe('近 7 天还没有发布记录')
    expect(wrapper.findAll('.chart__col')).toHaveLength(0)
  })

  it('有数据时渲染 7 列并高亮今天', () => {
    const wrapper = mountChart(statsFor([makePost('今天', NOW)]))

    const columns = wrapper.findAll('.chart__col')
    expect(columns).toHaveLength(7)
    expect(columns.at(-1)?.classes()).toContain('is-today')
    expect(wrapper.find('.chart__empty').classes()).not.toContain('is-visible')
    expect(wrapper.find('.chart').attributes('aria-label')).toContain('近 7 天共发布 1 条')
  })

  it('按最大值比例计算柱高，最小可见高度为 8%', () => {
    const posts = [
      makePost('一', NOW),
      makePost('二', NOW - 1000),
      makePost('三', NOW - 2000),
      makePost('四', NOW - 86_400_000),
    ]
    const wrapper = mountChart(statsFor(posts))
    const bars = wrapper.findAll('.chart__bar')

    // 今天 3 条 → 100%，昨天 1 条 → 33%
    expect(bars.at(-1)?.attributes('style')).toContain('100%')
    expect(bars.at(-2)?.attributes('style')).toContain('33%')
  })

  it('零值日期显示占位样式且不显示数字', () => {
    const wrapper = mountChart(statsFor([makePost('今天', NOW)]))
    const columns = wrapper.findAll('.chart__col')
    const emptyColumn = columns[0]!

    expect(emptyColumn.find('.chart__bar').classes()).toContain('is-zero')
    expect(emptyColumn.find('.chart__count').text()).toBe('')
    expect(columns.at(-1)?.find('.chart__count').text()).toBe('1')
  })

  it('aria-label 汇总每日条数', () => {
    const wrapper = mountChart(statsFor([makePost('今天', NOW), makePost('昨天', NOW - 86_400_000)]))
    const label = wrapper.find('.chart').attributes('aria-label') ?? ''

    expect(label).toContain('近 7 天共发布 2 条')
    expect(label).toContain('今天 1 条')
    expect(label).toContain('周四 1 条')
  })
})

function mountChart(stats: ReturnType<typeof statsFor>) {
  return mountWithPinia(TrendChart, { props: { stats } }).wrapper
}
