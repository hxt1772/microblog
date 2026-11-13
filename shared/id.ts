/**
 * 生成动态 id：优先使用运行环境原生 UUID，环境不支持时退回时间戳 + 随机串。
 */
export function createId(): string {
  const cryptoApi = globalThis.crypto

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID()
    } catch {
      // 某些受限环境会抛错，直接走降级实现
    }
  }

  return createFallbackId()
}

/** 降级 id：`p-<base36 时间戳>-<base36 随机串>`。 */
export function createFallbackId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
