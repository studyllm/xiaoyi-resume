import type { Draft } from './types'

export interface IdSeed {
  next(kind: string): string
}

function makeSeed(counters: Map<string, number>, startFrom = 0): IdSeed {
  return {
    next(kind: string): string {
      const value = (counters.get(kind) ?? startFrom) + 1
      counters.set(kind, value)
      return `${kind}-${value}`
    },
  }
}

/**
 * 新建一个 id 种子。
 *
 * `startFrom` 是各类 id 的起始计数。**要生成全局唯一的 id 时必须给**——
 * 默认从 1 开始，同一进程里每次新建种子都会得到同样的 id（`version-1`、
 * `version-2`…），而版本 id 是数据库的全局主键，撞了就是插入失败。
 */
export function createIdSeed(startFrom = 0): IdSeed {
  return makeSeed(new Map(), startFrom)
}

export function resumeIdSeed(existingIds: string[]): IdSeed {
  const counters = new Map<string, number>()
  for (const id of existingIds) {
    const separator = id.lastIndexOf('-')
    if (separator <= 0) continue
    const kind = id.slice(0, separator)
    const value = Number(id.slice(separator + 1))
    if (!Number.isInteger(value) || value <= 0) continue
    counters.set(kind, Math.max(counters.get(kind) ?? 0, value))
  }
  return makeSeed(counters)
}

export function collectDraftIds(draft: Draft): string[] {
  const ids: string[] = [draft.id]
  for (const section of draft.sections) {
    ids.push(section.id)
    for (const item of section.items) {
      ids.push(item.id)
      for (const bullet of item.bullets) ids.push(bullet.id)
    }
  }
  return ids
}
