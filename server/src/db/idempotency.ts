/**
 * 幂等键的记忆。
 *
 * 契约 §6：`POST /api/v1/versions` 必须带 `Idempotency-Key`，同键的重复请求
 * 返回第一次的结果，不再执行副作用——解决「手快点两下」与「超时后重试」。
 *
 * 存在内存里：v1.0 是单实例（计划 §7.5），多副本要另做共享存储。
 */
export interface IdempotencyStore {
  /** 记住这次的结果。同键再来一次就返回它。 */
  remember(key: string, result: unknown): void
  /** 取回记住的结果。没有就返回 undefined。 */
  recall(key: string): unknown | undefined
}

const TTL_MS = 24 * 60 * 60 * 1000

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const entries = new Map<string, { result: unknown; expiresAt: number }>()

  function prune(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key)
    }
  }

  return {
    remember(key, result) {
      const now = Date.now()
      prune(now)
      entries.set(key, { result, expiresAt: now + TTL_MS })
    },
    recall(key) {
      const now = Date.now()
      prune(now)
      return entries.get(key)?.result
    },
  }
}
