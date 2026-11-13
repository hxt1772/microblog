import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.useRealTimers()
  // 清理上一个用例 stub 的全局对象（如 fetch），避免跨用例泄漏
  vi.unstubAllGlobals()

  // 后端用例运行在 node 环境，没有 window / document，跳过浏览器侧清理
  if (typeof window === 'undefined') return

  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
})
