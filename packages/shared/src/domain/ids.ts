import type { Draft } from './types'

export interface IdSeed {
  next(kind: string): string
}

function makeSeed(counters: Map<string, number>): IdSeed {
  return {
    next(kind: string): string {
      const value = (counters.get(kind) ?? 0) + 1
      counters.set(kind, value)
      return `${kind}-${value}`
    },
  }
}

export function createIdSeed(): IdSeed {
  return makeSeed(new Map())
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
