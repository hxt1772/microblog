import { describe, expect, it, vi } from 'vitest'
import { TOAST_DURATION_MS } from '@/config/constants'
import { useToastStore } from '@/stores/useToastStore'
import { mountWithPinia } from '@/test-utils/mount'
import ToastHost from './ToastHost.vue'

describe('ToastHost', () => {
  it('初始隐藏', () => {
    const { wrapper } = mountWithPinia(ToastHost)

    expect(wrapper.find('[data-testid="toast"]').classes()).not.toContain('is-visible')
  })

  it('show 后显示文案并在超时后自动隐藏', async () => {
    vi.useFakeTimers()
    const { wrapper } = mountWithPinia(ToastHost)
    const toast = useToastStore()

    toast.show('发布成功')
    await wrapper.vm.$nextTick()

    const node = wrapper.find('[data-testid="toast"]')
    expect(node.text()).toBe('发布成功')
    expect(node.classes()).toContain('is-visible')

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    await wrapper.vm.$nextTick()

    expect(node.classes()).not.toContain('is-visible')
    vi.useRealTimers()
  })

  it('连续提示时重新计时', async () => {
    vi.useFakeTimers()
    const { wrapper } = mountWithPinia(ToastHost)
    const toast = useToastStore()

    toast.show('第一条')
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(TOAST_DURATION_MS - 500)

    toast.show('第二条')
    await wrapper.vm.$nextTick()
    vi.advanceTimersByTime(TOAST_DURATION_MS - 500)

    expect(wrapper.find('[data-testid="toast"]').text()).toBe('第二条')
    expect(wrapper.find('[data-testid="toast"]').classes()).toContain('is-visible')

    vi.advanceTimersByTime(600)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="toast"]').classes()).not.toContain('is-visible')

    vi.useRealTimers()
  })
})
