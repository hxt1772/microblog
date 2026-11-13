import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { MAX_LENGTH, NEAR_LENGTH_THRESHOLD, SUCCESS_FLASH_MS } from '@/config/constants'
import { usePostsStore } from '@/stores/usePostsStore'
import { useToastStore } from '@/stores/useToastStore'
import { installFakeServer } from '@/test-utils/fakeServer'
import { mountWithPinia } from '@/test-utils/mount'
import PostComposer from './PostComposer.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

/** 安装 fake server、挂载输入框并完成水合。 */
async function mountComposer() {
  const server = installFakeServer({ now: () => NOW })
  const { wrapper } = mountWithPinia(PostComposer)
  const store = usePostsStore()
  await store.hydrate(NOW)
  return { wrapper, store, toast: useToastStore(), server }
}

/** 构造一个立即返回指定 JSON 的 fetch 替身。 */
function stubJsonResponse(body: unknown, status: number): void {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

describe('PostComposer / 输入状态', () => {
  it('初始为空：按钮禁用，计数为 0', async () => {
    const { wrapper } = await mountComposer()

    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="composer-counter-value"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="composer-counter"]').text()).toContain(`/ ${MAX_LENGTH}`)
  })

  it('输入内容后启用发布并同步字数', async () => {
    const { wrapper } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('你好世界')

    expect(wrapper.find('[data-testid="composer-counter-value"]').text()).toBe('4')
    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('纯空白内容不启用发布', async () => {
    const { wrapper } = await mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('    \n  ')

    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
  })

  it('接近上限时提示、超限后禁用发布', async () => {
    const { wrapper } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')
    const counter = wrapper.find('[data-testid="composer-counter"]')

    await input.setValue('あ'.repeat(NEAR_LENGTH_THRESHOLD))
    expect(counter.classes()).toContain('is-near')

    await input.setValue('あ'.repeat(MAX_LENGTH))
    expect(counter.classes()).toContain('is-near')
    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeUndefined()

    await input.setValue('あ'.repeat(MAX_LENGTH + 1))
    expect(counter.classes()).toContain('is-over')
    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
  })
})

describe('PostComposer / 发布', () => {
  it('点击发布后清空输入、写入服务端并提示成功', async () => {
    const { wrapper, store, toast, server } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('记录一下')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(store.posts).toHaveLength(1)
    expect(store.posts[0]?.content).toBe('记录一下')
    expect(server.store.count()).toBe(1)
    expect((input.element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('[data-testid="composer-counter-value"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
    expect(toast.message).toBe('发布成功')
  })

  it('发布前去除首尾空白', async () => {
    const { wrapper, store } = await mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('  带空格的动态  ')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(store.posts[0]?.content).toBe('带空格的动态')
  })

  it('Ctrl + Enter 快速发布', async () => {
    const { wrapper, store } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('快捷键发布')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(store.posts).toHaveLength(1)
  })

  it('Cmd + Enter 快速发布', async () => {
    const { wrapper, store } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('Mac 快捷键')
    await input.trigger('keydown', { key: 'Enter', metaKey: true })
    await flushPromises()

    expect(store.posts).toHaveLength(1)
  })

  it('单独 Enter 只换行，不发布', async () => {
    const { wrapper, store } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('第一行')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(store.posts).toHaveLength(0)
  })

  it('中文输入法组词期间不触发发布', async () => {
    const { wrapper, store } = await mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.trigger('compositionstart')
    await input.setValue('正在组词')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(store.posts).toHaveLength(0)

    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(store.posts).toHaveLength(1)
  })

  it('超限内容不会被提交', async () => {
    const { wrapper, store, toast } = await mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('あ'.repeat(MAX_LENGTH + 1))
    await wrapper.find('[data-testid="composer-input"]').trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(store.posts).toHaveLength(0)
    expect(toast.message).toBe(`内容超出 ${MAX_LENGTH} 字限制`)
  })

  it('提交过程中禁用按钮，避免重复发布', async () => {
    const { wrapper, store } = await mountComposer()

    let release: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(
              new Response(JSON.stringify({ post: { id: 'slow-1', content: '慢请求', createdAt: NOW } }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              }),
            )
          }
        }),
    )

    const input = wrapper.find('[data-testid="composer-input"]')
    const button = wrapper.find('[data-testid="composer-submit"]')
    await input.setValue('慢请求')

    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()

    // 提交仍在飞行中，重复点击不应产生第二条
    await button.trigger('click')
    release()
    await flushPromises()

    expect(store.posts).toHaveLength(1)
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('请求飞行期间继续输入，成功后只清空已提交的内容', async () => {
    const { wrapper, store } = await mountComposer()

    let release: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(
              new Response(JSON.stringify({ post: { id: 'slow-2', content: '第一条', createdAt: NOW } }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              }),
            )
          }
        }),
    )

    const input = wrapper.find('[data-testid="composer-input"]')
    await input.setValue('第一条')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')

    // 请求未返回时用户继续输入，这段内容不能被清掉
    await input.setValue('第二条草稿')
    release()
    await flushPromises()

    expect(store.posts.map((post) => post.content)).toEqual(['第一条'])
    expect((input.element as HTMLTextAreaElement).value).toBe('第二条草稿')
  })

  it('服务端 400 EMPTY_CONTENT 提示补充内容', async () => {
    const { wrapper, store, toast } = await mountComposer()
    stubJsonResponse({ error: { code: 'EMPTY_CONTENT', message: '内容不能为空' } }, 400)

    await wrapper.find('[data-testid="composer-input"]').setValue('会被服务端拒绝')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(store.posts).toHaveLength(0)
    expect(toast.message).toBe('写点什么再发布吧')
  })

  it('服务不可用时提示失败并保留草稿', async () => {
    const { wrapper, store, toast } = await mountComposer()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('发不出去的草稿')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')
    await flushPromises()

    expect(store.posts).toHaveLength(0)
    expect(store.apiAvailable).toBe(false)
    expect((input.element as HTMLTextAreaElement).value).toBe('发不出去的草稿')
    expect(toast.message).toBe('发布失败，服务暂时不可用，请稍后重试')
  })

  it('按钮短暂显示已发布后恢复', async () => {
    const { wrapper } = await mountComposer()
    const button = wrapper.find('[data-testid="composer-submit"]')

    await wrapper.find('[data-testid="composer-input"]').setValue('成功反馈')

    vi.useFakeTimers()
    await button.trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(button.text()).toContain('已发布')

    await vi.advanceTimersByTimeAsync(SUCCESS_FLASH_MS)
    await wrapper.vm.$nextTick()
    expect(button.text()).toContain('发布')

    vi.useRealTimers()
  })
})
