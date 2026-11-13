import { describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '@/config/constants'
import { usePostsStore } from '@/stores/usePostsStore'
import { mountWithPinia } from '@/test-utils/mount'
import type { Post } from '@/types/post'
import PostFeed from './PostFeed.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function seed(posts: Post[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
}

async function mountFeed() {
  const { wrapper } = mountWithPinia(PostFeed)
  usePostsStore().hydrate(NOW)
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('PostFeed', () => {
  it('无内容时展示空状态与 0 条计数', async () => {
    const wrapper = await mountFeed()

    expect(wrapper.text()).toContain('还没有内容')
    expect(wrapper.text()).toContain('发布第一条动态，它只保存在这台设备上。')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('0 条')
    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(0)
  })

  it('按倒序渲染动态并更新计数', async () => {
    seed([
      { id: 'old', content: '较早的动态', createdAt: NOW - 3_600_000 },
      { id: 'new', content: '最新的动态', createdAt: NOW },
    ])
    const wrapper = await mountFeed()

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('最新的动态')
    expect(items[1]?.text()).toContain('较早的动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('2 条')
    expect(wrapper.text()).not.toContain('还没有内容')
  })

  it('新发布的动态立即出现在列表顶部', async () => {
    seed([{ id: 'old', content: '旧动态', createdAt: NOW - 3_600_000 }])
    const wrapper = await mountFeed()

    usePostsStore().publish('新动态', NOW)
    await wrapper.vm.$nextTick()

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('新动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('2 条')
  })
})
