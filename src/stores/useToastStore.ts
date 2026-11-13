import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 轻量 Toast 状态：只保存文案与显隐，计时与动画交给 ToastHost，
 * 避免把定时器放进 store 导致测试与卸载泄漏。
 */
export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  const visible = ref(false)
  /** 每次展示自增，供宿主组件重启计时器。 */
  const token = ref(0)

  function show(text: string): void {
    message.value = text
    token.value += 1
    visible.value = true
  }

  function hide(): void {
    visible.value = false
  }

  return { message, visible, token, show, hide }
})
