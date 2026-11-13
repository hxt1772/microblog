import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { mount, type MountingOptions, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'

export interface MountResult {
  wrapper: VueWrapper
  pinia: Pinia
}

/**
 * 组件测试统一入口：每个用例一个全新的 Pinia 实例，
 * 组件使用真实 store（stubActions: false），覆盖端到端行为。
 */
export function mountWithPinia(component: Component, options: MountingOptions<any> = {}): MountResult {
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [pinia, ...(options.global?.plugins ?? [])],
    },
  })

  return { wrapper, pinia }
}
