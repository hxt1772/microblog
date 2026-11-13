import type { Ref } from 'vue'
import { TEXTAREA_MAX_HEIGHT } from '@/config/constants'

/**
 * 让 textarea 随内容自动增高，超过阈值后固定高度并交给内部滚动。
 * DOM 行为与元素的生命周期留在这里，组件只负责在输入时调用 `resize`。
 */
export function useAutoResizeTextarea(target: Ref<HTMLTextAreaElement | null>) {
  function resize(): void {
    const element = target.value
    if (!element) return

    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight || 0, TEXTAREA_MAX_HEIGHT)}px`
  }

  return { resize }
}
