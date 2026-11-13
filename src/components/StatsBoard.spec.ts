import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { usePostsStore } from '@/stores/usePostsStore'
import { installFakeServer } from '@/test-utils/fakeServer'
import type { FakeServerSeed } from '@/test-utils/fakeServer'
import { mountWithPinia } from '@/test-utils/mount'
import StatsBoard from './StatsBoard.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

/** 安装 fake server 并挂载统计看板，随后完成水合。 */
async function mountBoard(seed: readonly FakeServerSeed[] = []) {
  installFakeServer({ now: () => NOW, seed })
  const { wrapper } = mountWithPinia(StatsBoard)
  const store = usePostsStore()
  await store.hydrate(NOW)
  await flushPromises()
  return { wrapper, store }
}

describe('StatsBoard', () => {
  it('空数据时三项指标为 0 并展示图表空态', async () => {
    const { wrapper } = await mountBoard()

    expect(wrapper.find('[data-testid="stat-total"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="stat-chars"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="stat-today"]').text()).toBe('0')
    expect(wrapper.find('.chart__empty').text()).toBe('近 7 天还没有发布记录')
  })

  it('展示总量、累计字数（emoji 计 1）与今日条数', async () => {
    const { wrapper } = await mountBoard([
      { content: '今天👍', createdAt: NOW },
      { content: '昨天', createdAt: NOW - 86_400_000 },
      { content: '三天前', createdAt: NOW - 3 * 86_400_000 },
    ])

    expect(wrapper.find('[data-testid="stat-total"]').text()).toBe('3')
    expect(wrapper.find('[data-testid="stat-chars"]').text()).toBe('8')
    expect(wrapper.find('[data-testid="stat-today"]').text()).toBe('1')
  })

  it('发布后指标即时更新并触发数字动画', async () => {
    const { wrapper, store } = await mountBoard()

    vi.useFakeTimers()
    await store.publish('新增一条', NOW)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="stat-total"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="stat-today"]').text()).toBe('1')
    expect(wrapper.findAll('.stat__value').every((value) => value.classes().includes('is-bump'))).toBe(true)

    vi.advanceTimersByTime(600)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.stat__value').some((value) => value.classes().includes('is-bump'))).toBe(false)

    vi.useRealTimers()
  })

  it('大数字使用千分位展示', async () => {
    const seeded = Array.from({ length: 300 }, (_, index) => ({
      content: '字'.repeat(4),
      createdAt: NOW - index * 1000,
    }))
    const { wrapper } = await mountBoard(seeded)

    expect(wrapper.find('[data-testid="stat-chars"]').text()).toBe('1,200')
  })
})
