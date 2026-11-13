import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFallbackId, createId } from './id'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createId', () => {
  it('优先使用 crypto.randomUUID', () => {
    const randomUUID = vi.fn(() => 'uuid-from-crypto')
    vi.stubGlobal('crypto', { randomUUID })

    expect(createId()).toBe('uuid-from-crypto')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('crypto 不可用时退回时间戳随机串', () => {
    vi.stubGlobal('crypto', undefined)

    expect(createId()).toMatch(/^p-[0-9a-z]+-[0-9a-z]+$/)
  })

  it('randomUUID 抛错时退回降级实现', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('not allowed')
      },
    })

    expect(createId()).toMatch(/^p-[0-9a-z]+-[0-9a-z]+$/)
  })

  it('降级实现生成的 id 互不相同', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createFallbackId()))

    expect(ids.size).toBe(200)
  })
})
