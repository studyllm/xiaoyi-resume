/**
 * 存量数据的迁移。
 *
 * 范式来自 `frontend/src/stores/persistence.ts`：**版本号 + 迁移链 + 失败不白屏**。
 * 搬到服务端时，「一份本地存档」变成「一批资源」——某个资源迁移失败不该让整次
 * 迁移白屏：丢掉那一个，其余照常导入，并提示一次（计划 T3.3、A3.3）。
 */

export interface MigrationStep {
  version: number
  migrate(value: unknown): unknown
}

export interface MigrationResult<T> {
  value: T | null
  /** 这份数据没能迁移，已丢弃。 */
  discarded: boolean
  reason?: string
}

/** 迁移一份数据。失败不抛异常——抛出去就白屏了。 */
export function migrateOne<T>(raw: unknown, steps: MigrationStep[]): MigrationResult<T> {
  try {
    let value: unknown = raw
    for (const step of steps) value = step.migrate(value)
    return { value: value as T, discarded: false }
  } catch (error) {
    return {
      value: null,
      discarded: true,
      reason: error instanceof Error ? error.message : '未知原因',
    }
  }
}

export interface BatchMigrationResult<T> {
  /** 迁移成功的数据。 */
  migrated: T[]
  /** 没能迁移的那些：键与原因。 */
  discarded: Array<{ key: string; reason: string }>
}

/**
 * 迁移一批数据。
 *
 * 一份失败不影响其余——这是「失败不白屏」在批量场景下的样子。
 */
export function migrateMany<T>(
  items: Array<{ key: string; raw: unknown }>,
  stepsFor: (key: string) => MigrationStep[],
): BatchMigrationResult<T> {
  const migrated: T[] = []
  const discarded: Array<{ key: string; reason: string }> = []

  for (const item of items) {
    const result = migrateOne<T>(item.raw, stepsFor(item.key))
    if (result.discarded || result.value === null) {
      discarded.push({ key: item.key, reason: result.reason ?? '未知原因' })
      continue
    }
    migrated.push(result.value)
  }

  return { migrated, discarded }
}
