import { describe, expect, it, vi } from 'vitest'
import { MAX_LENGTH, NEAR_LENGTH_THRESHOLD } from '@/config/constants'
import { usePostsStore } from '@/stores/usePostsStore'
import { useToastStore } from '@/stores/useToastStore'
import { mountWithPinia } from '@/test-utils/mount'
import PostComposer from './PostComposer.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function mountComposer() {
  const { wrapper } = mountWithPinia(PostComposer)
  const store = usePostsStore()
  store.hydrate(NOW)
  return { wrapper, store, toast: useToastStore() }
}

describe('PostComposer / 输入状态', () => {
  it('初始为空：按钮禁用，计数为 0', () => {
    const { wrapper } = mountComposer()

    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="composer-counter-value"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="composer-counter"]').text()).toContain(`/ ${MAX_LENGTH}`)
  })

  it('输入内容后启用发布并同步字数', async () => {
    const { wrapper } = mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('你好世界')

    expect(wrapper.find('[data-testid="composer-counter-value"]').text()).toBe('4')
    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('纯空白内容不启用发布', async () => {
    const { wrapper } = mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('    \n  ')

    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
  })

  it('接近上限时提示、超限后禁用发布', async () => {
    const { wrapper } = mountComposer()
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
  it('点击发布后清空输入、写入 store 并提示成功', async () => {
    const { wrapper, store, toast } = mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('记录一下')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')

    expect(store.posts).toHaveLength(1)
    expect(store.posts[0]?.content).toBe('记录一下')
    expect((input.element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('[data-testid="composer-counter-value"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="composer-submit"]').attributes('disabled')).toBeDefined()
    expect(toast.message).toBe('发布成功')
  })

  it('发布前去除首尾空白', async () => {
    const { wrapper, store } = mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('  带空格的动态  ')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')

    expect(store.posts[0]?.content).toBe('带空格的动态')
  })

  it('Ctrl + Enter 快速发布', async () => {
    const { wrapper, store } = mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('快捷键发布')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(store.posts).toHaveLength(1)
  })

  it('Cmd + Enter 快速发布', async () => {
    const { wrapper, store } = mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('Mac 快捷键')
    await input.trigger('keydown', { key: 'Enter', metaKey: true })

    expect(store.posts).toHaveLength(1)
  })

  it('单独 Enter 只换行，不发布', async () => {
    const { wrapper, store } = mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.setValue('第一行')
    await input.trigger('keydown', { key: 'Enter' })

    expect(store.posts).toHaveLength(0)
  })

  it('中文输入法组词期间不触发发布', async () => {
    const { wrapper, store } = mountComposer()
    const input = wrapper.find('[data-testid="composer-input"]')

    await input.trigger('compositionstart')
    await input.setValue('正在组词')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(store.posts).toHaveLength(0)

    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(store.posts).toHaveLength(1)
  })

  it('超限内容不会被提交', async () => {
    const { wrapper, store, toast } = mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('あ'.repeat(MAX_LENGTH + 1))
    await wrapper.find('[data-testid="composer-input"]').trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(store.posts).toHaveLength(0)
    expect(toast.message).toBe(`内容超出 ${MAX_LENGTH} 字限制`)
  })

  it('按钮短暂显示已发布后恢复', async () => {
    vi.useFakeTimers()
    const { wrapper } = mountComposer()
    const button = wrapper.find('[data-testid="composer-submit"]')

    await wrapper.find('[data-testid="composer-input"]').setValue('成功反馈')
    await button.trigger('click')
    expect(button.text()).toContain('已发布')

    vi.advanceTimersByTime(900)
    await wrapper.vm.$nextTick()
    expect(button.text()).toContain('发布')

    vi.useRealTimers()
  })

  it('存储不可用时提示内容会丢失', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { wrapper, store, toast } = mountComposer()

    await wrapper.find('[data-testid="composer-input"]').setValue('写不进去')
    await wrapper.find('[data-testid="composer-submit"]').trigger('click')

    expect(store.storageAvailable).toBe(false)
    expect(toast.message).toBe('已发布，但本地存储不可用，刷新后会丢失')
  })
})
