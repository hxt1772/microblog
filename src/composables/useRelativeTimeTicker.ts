import { onBeforeUnmount, onMounted } from 'vue'
import { TICK_INTERVAL_MS } from '@/config/constants'

/**
 * 每 60 秒以及在页面重新可见时触发一次回调，用于刷新相对时间与跨天统计。
 * 页面隐藏时跳过，避免后台无谓计算；组件卸载时自动清理。
 */
export function useRelativeTimeTicker(onTick: () => void): void {
  let timer: ReturnType<typeof setInterval> | undefined

  function tick(): void {
    if (document.hidden) return
    onTick()
  }

  onMounted(() => {
    timer = setInterval(tick, TICK_INTERVAL_MS)
    document.addEventListener('visibilitychange', tick)
  })

  onBeforeUnmount(() => {
    if (timer !== undefined) clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
  })
}
