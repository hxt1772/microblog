import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useToastStore } from './useToastStore'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useToastStore', () => {
  it('初始状态不可见且无文案', () => {
    const store = useToastStore()

    expect(store.visible).toBe(false)
    expect(store.message).toBe('')
  })

  it('show 后可见并携带文案', () => {
    const store = useToastStore()

    store.show('发布成功')

    expect(store.visible).toBe(true)
    expect(store.message).toBe('发布成功')
  })

  it('再次 show 覆盖文案并递增 token 以便重启计时', () => {
    const store = useToastStore()

    store.show('第一条')
    const firstToken = store.token
    store.show('第二条')

    expect(store.message).toBe('第二条')
    expect(store.token).toBe(firstToken + 1)
  })

  it('hide 只隐藏，不清空最近文案', () => {
    const store = useToastStore()
    store.show('发布成功')

    store.hide()

    expect(store.visible).toBe(false)
    expect(store.message).toBe('发布成功')
  })
})
