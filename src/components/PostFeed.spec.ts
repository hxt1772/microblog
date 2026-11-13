import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { usePostsStore } from '@/stores/usePostsStore'
import { installFakeServer } from '@/test-utils/fakeServer'
import type { FakeServerSeed } from '@/test-utils/fakeServer'
import { mountWithPinia } from '@/test-utils/mount'
import PostFeed from './PostFeed.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

/** 安装 fake server 并挂载列表，随后完成水合。 */
async function mountFeed(seed: readonly FakeServerSeed[] = []) {
  installFakeServer({ now: () => NOW, seed })
  const { wrapper } = mountWithPinia(PostFeed)
  const store = usePostsStore()
  await store.hydrate(NOW)
  await flushPromises()
  return { wrapper, store }
}

describe('PostFeed', () => {
  it('水合前展示加载态，水合后消失', async () => {
    installFakeServer()
    const { wrapper } = mountWithPinia(PostFeed)

    expect(wrapper.find('[data-testid="feed-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)

    await usePostsStore().hydrate(NOW)
    await flushPromises()

    expect(wrapper.find('[data-testid="feed-loading"]').exists()).toBe(false)
  })

  it('无内容时展示空状态与 0 条计数', async () => {
    const { wrapper } = await mountFeed()

    expect(wrapper.text()).toContain('还没有内容')
    expect(wrapper.text()).toContain('发布第一条动态，它会保存到服务端。')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('0 条')
    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(0)
  })

  it('按倒序渲染服务端动态并更新计数', async () => {
    const { wrapper } = await mountFeed([
      { content: '较早的动态', createdAt: NOW - 3_600_000 },
      { content: '最新的动态', createdAt: NOW },
    ])

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('最新的动态')
    expect(items[1]?.text()).toContain('较早的动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('2 条')
    expect(wrapper.text()).not.toContain('还没有内容')
  })

  it('新发布的动态立即出现在列表顶部', async () => {
    const { wrapper, store } = await mountFeed([{ content: '旧动态', createdAt: NOW - 3_600_000 }])

    await store.publish('新动态', NOW)
    await flushPromises()

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('新动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('2 条')
  })
})
