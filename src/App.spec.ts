import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { usePostsStore } from '@/stores/usePostsStore'
import { installFakeServer } from '@/test-utils/fakeServer'
import type { FakeServer, FakeServerOptions } from '@/test-utils/fakeServer'
import { mountWithPinia } from '@/test-utils/mount'
import App from './App.vue'

/** 挂载 App 并等待首屏的异步水合完成。 */
async function mountApp(): Promise<VueWrapper> {
  const { wrapper } = mountWithPinia(App)
  await flushPromises()
  return wrapper
}

/** 安装 fake server 后再挂载，模拟真实后端。 */
async function mountWithServer(options: FakeServerOptions = {}): Promise<{
  wrapper: VueWrapper
  server: FakeServer
}> {
  const server = installFakeServer(options)
  return { wrapper: await mountApp(), server }
}

describe('App 首屏', () => {
  it('渲染品牌、三个功能区块与页脚说明', async () => {
    const { wrapper } = await mountWithServer()

    expect(wrapper.text()).toContain('微语')
    expect(wrapper.text()).toContain('MOMENTS')
    expect(wrapper.text()).toContain('服务端存储')
    expect(wrapper.text()).toContain('统计看板')
    expect(wrapper.text()).toContain('最新动态')
    expect(wrapper.text()).toContain('内容保存在服务端内存中，重启服务后会清空。')
  })

  it('无数据时展示空状态', async () => {
    const { wrapper } = await mountWithServer()

    expect(wrapper.find('[data-testid="feed-loading"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('还没有内容')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('0 条')
  })
})

describe('App 发布闭环', () => {
  it('发布后列表、统计与服务端数据同步更新', async () => {
    const { wrapper, server } = await mountWithServer()

    await wrapper.find('[data-testid="composer-input"]').setValue('第一条动态')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    const items = wrapper.findAll('[data-testid="post-item"]')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('第一条动态')
    expect(wrapper.find('[data-testid="feed-count"]').text()).toBe('1 条')
    expect(wrapper.find('[data-testid="stat-total"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="stat-today"]').text()).toBe('1')

    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.text()).toBe('发布成功')
    expect(toast.classes()).toContain('is-visible')

    expect(server.store.list().map((post) => post.content)).toEqual(['第一条动态'])
  })

  it('重新挂载后仍能从服务端恢复内容', async () => {
    const { wrapper, server } = await mountWithServer()

    await wrapper.find('[data-testid="composer-input"]').setValue('跨会话保留')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()
    wrapper.unmount()

    // 重新挂载等价于刷新页面：Pinia 全新实例，但服务端内存仍在
    const second = await mountApp()

    expect(second.findAll('[data-testid="post-item"]')).toHaveLength(1)
    expect(second.text()).toContain('跨会话保留')
    expect(second.find('[data-testid="stat-total"]').text()).toBe('1')
    expect(server.store.count()).toBe(1)
  })

  it('发布失败时保留草稿并提示服务不可用', async () => {
    const { wrapper } = await mountWithServer()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    const input = wrapper.find('[data-testid="composer-input"]')
    await input.setValue('发不出去的草稿')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(0)
    expect((input.element as HTMLTextAreaElement).value).toBe('发不出去的草稿')
    expect(wrapper.find('[data-testid="toast"]').text()).toBe('发布失败，服务暂时不可用，请稍后重试')
  })

  it('服务不可用时提示且展示空态', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    const wrapper = await mountApp()

    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.text()).toBe('服务暂时不可用，内容无法加载')
    expect(toast.classes()).toContain('is-visible')
    expect(usePostsStore().apiAvailable).toBe(false)
    expect(wrapper.text()).toContain('还没有内容')
  })

  it('用户内容按纯文本渲染', async () => {
    const { wrapper } = await mountWithServer()

    await wrapper.find('[data-testid="composer-input"]').setValue('<script>alert(1)</script>')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="post-item"]').html()).not.toContain('<script>')
    expect(wrapper.find('[data-testid="post-item"]').text()).toContain('<script>alert(1)</script>')
  })
})

describe('App 点赞与收藏闭环', () => {
  const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

  /** 点击第 index 条动态上的指定按钮。 */
  async function clickAction(wrapper: VueWrapper, index: number, testId: string): Promise<void> {
    const item = wrapper.findAll('[data-testid="post-item"]')[index]
    if (!item) throw new Error(`没有第 ${index} 条动态`)
    await item.find(`[data-testid="${testId}"]`).trigger('click')
    await flushPromises()
  }

  it('点赞后计数与状态更新，重启客户端仍能从服务端恢复', async () => {
    const { wrapper, server } = await mountWithServer({
      now: () => NOW,
      seed: [{ content: '值得点赞', createdAt: NOW }],
    })

    await clickAction(wrapper, 0, 'like-button')

    const item = wrapper.find('[data-testid="post-item"]')
    expect(item.find('[data-testid="like-count"]').text()).toBe('1')
    expect(item.find('[data-testid="like-button"]').attributes('aria-pressed')).toBe('true')

    // 服务端是唯一真源
    expect(server.store.list()[0]).toMatchObject({ likes: 1, liked: true })

    wrapper.unmount()
    const second = await mountApp()
    const restored = second.find('[data-testid="post-item"]')
    expect(restored.find('[data-testid="like-count"]').text()).toBe('1')
    expect(restored.find('[data-testid="like-button"]').attributes('aria-pressed')).toBe('true')
  })

  it('再次点击取消点赞，收藏与点赞互不影响', async () => {
    const { wrapper, server } = await mountWithServer({
      now: () => NOW,
      seed: [{ content: '互动动态', createdAt: NOW }],
    })

    await clickAction(wrapper, 0, 'like-button')
    await clickAction(wrapper, 0, 'favorite-button')

    let item = wrapper.find('[data-testid="post-item"]')
    expect(item.find('[data-testid="like-button"]').attributes('aria-pressed')).toBe('true')
    expect(item.find('[data-testid="favorite-button"]').attributes('aria-pressed')).toBe('true')
    expect(server.store.list()[0]).toMatchObject({ liked: true, favorited: true, likes: 1 })

    await clickAction(wrapper, 0, 'like-button')

    item = wrapper.find('[data-testid="post-item"]')
    expect(item.find('[data-testid="like-count"]').text()).toBe('0')
    expect(item.find('[data-testid="like-button"]').attributes('aria-pressed')).toBe('false')
    // 取消点赞不影响收藏
    expect(item.find('[data-testid="favorite-button"]').attributes('aria-pressed')).toBe('true')
    expect(server.store.list()[0]).toMatchObject({ liked: false, favorited: true, likes: 0 })
  })

  it('收藏筛选只展示已收藏动态，取消后回到收藏空态', async () => {
    const { wrapper } = await mountWithServer({
      now: () => NOW,
      seed: [
        { content: '较旧的一条', createdAt: NOW - 60_000 },
        { content: '较新的一条', createdAt: NOW },
      ],
    })

    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(2)

    // 列表按时间倒序：第 0 条是「较新的一条」
    await clickAction(wrapper, 0, 'favorite-button')
    await wrapper.find('[data-testid="feed-tab-favorites"]').trigger('click')
    await flushPromises()

    const favorites = wrapper.findAll('[data-testid="post-item"]')
    expect(favorites).toHaveLength(1)
    expect(favorites[0]?.text()).toContain('较新的一条')
    expect(wrapper.find('[data-testid="favorites-count"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="feed-tab-favorites"]').attributes('aria-pressed')).toBe('true')

    await clickAction(wrapper, 0, 'favorite-button')

    expect(wrapper.find('[data-testid="favorites-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="favorites-count"]').text()).toBe('0')

    await wrapper.find('[data-testid="feed-tab-all"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="post-item"]')).toHaveLength(2)
  })

  it('互动请求失败时提示服务不可用且状态不变', async () => {
    const { wrapper } = await mountWithServer({
      now: () => NOW,
      seed: [{ content: '点不动', createdAt: NOW }],
    })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    await clickAction(wrapper, 0, 'like-button')

    const item = wrapper.find('[data-testid="post-item"]')
    expect(item.find('[data-testid="like-count"]').text()).toBe('0')
    expect(item.find('[data-testid="like-button"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('[data-testid="toast"]').text()).toBe('操作失败，服务暂时不可用')
    expect(usePostsStore().apiAvailable).toBe(false)
  })
})
