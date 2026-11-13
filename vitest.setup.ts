import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  window.localStorage.clear()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
})
