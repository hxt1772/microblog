import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { STORAGE_KEY } from '@/config/constants'
import { usePostsStore } from '@/stores/usePostsStore'
import { mountWithPinia } from '@/test-utils/mount'
import App from './App.vue'

async function mountApp() {
  const result = mountWithPinia(App)
  await nextTick()
  return result
}

describe('App 首屏', () => {
  it('渲染品牌、三个功能区块与页脚说明', async () => {
    const { wrapper } = await mountApp()

    expect(wrapper.text()).toContain('微语')
    expect(wrapper.text()).toContain('MOMENTS')
    expect(wrapper.text()).toContain('本地存储')
    expect(wrapper.text()).toContain('统计看板')
    expect(wrapper.text()).toContain('最新动态')
    expect(wrapper.text()).toContain('数据保存在本地浏览器，清空浏览器数据后会丢失。')
  })

  it('无数据时展示空状态', async () => {
    const { wrapper } = await mountApp()

    expect(wrapper.text()).toContain('还没有内容')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('0 条')
  })
})

describe('App 发布闭环', () => {
  it('发布后列表、统计与本地存储同步更新', async () => {
    const { wrapper } = await mountApp()

    await wrapper.find('[data-testid="composer-input"]').setValue('第一条动态')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await nextTick()

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('第一条动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('1 条')
    expect(wrapper.find('[data-testid="stat-total"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="stat-today"]').text()).toBe('1')

    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.text()).toBe('发布成功')
    expect(toast.classes()).toContain('is-visible')

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[]
    expect(stored).toHaveLength(1)
  })

  it('刷新页面（重新挂载）后仍能从本地恢复内容', async () => {
    const first = await mountApp()
    await first.wrapper.find('[data-testid="composer-input"]').setValue('跨会话保留')
    await first.wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await nextTick()
    first.wrapper.unmount()

    const second = await mountApp()

    expect(second.wrapper.findAll('[data-testid="post-item"]')).toHaveLength(1)
    expect(second.wrapper.text()).toContain('跨会话保留')
    expect(second.wrapper.find('[data-testid="stat-total"]').text()).toBe('1')
  })

  it('存储不可用时提示降级为内存存储', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { wrapper } = await mountApp()

    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.text()).toBe('本地存储不可用，当前内容仅保存在内存中')
    expect(toast.classes()).toContain('is-visible')
    expect(usePostsStore().storageAvailable).toBe(false)
  })

  it('用户内容按纯文本渲染', async () => {
    const { wrapper } = await mountApp()

    await wrapper.find('[data-testid="composer-input"]').setValue('<script>alert(1)</script>')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="post-item"]').html()).not.toContain('<script>')
    expect(wrapper.find('[data-testid="post-item"]').text()).toContain('<script>alert(1)</script>')
  })
})
