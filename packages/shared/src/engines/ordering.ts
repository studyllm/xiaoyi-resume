import { normalizeText } from './textUtils'
import type { BulletEvidence } from './coverage'

export const DEFAULT_MAX_BULLETS = 6
const TAIL_RATIO = 0.6
const PINNED_HEAD_SIZE = 2

export interface RemovedBullet {
  evidence: BulletEvidence
  reason: string
}

export function orderBullets(evidence: BulletEvidence[]): {
  ordered: BulletEvidence[]
  tailIds: Set<string>
} {
  const relevant = evidence.filter((entry) => entry.jdRelated)
  if (relevant.length === 0) return { ordered: evidence, tailIds: new Set() }

  const sortedRelevant = [...relevant].sort((left, right) => right.relevance - left.relevance)
  const pinnedIds = new Set(evidence.slice(0, PINNED_HEAD_SIZE).map((entry) => entry.bulletId))
  const pinnedRemaining = evidence.filter(
    (entry) => !relevant.includes(entry) && pinnedIds.has(entry.bulletId),
  )
  const movable = evidence.filter(
    (entry) => !relevant.includes(entry) && !pinnedIds.has(entry.bulletId),
  )
  const maxTail = Math.floor(evidence.length * TAIL_RATIO)
  const tail = movable.slice(0, maxTail)
  const overflow = movable.slice(maxTail)

  return {
    ordered: [...sortedRelevant, ...pinnedRemaining, ...overflow, ...tail],
    tailIds: new Set(tail.map((entry) => entry.bulletId)),
  }
}

export function trimBullets(
  evidence: BulletEvidence[],
  maxBullets: number,
): { removed: RemovedBullet[] } {
  const removed: RemovedBullet[] = []
  const seen = new Set<string>()
  const unique: BulletEvidence[] = []

  for (const entry of evidence) {
    const key = normalizeText(entry.text)
    if (key.length < 4) {
      removed.push({ evidence: entry, reason: '这条要点信息太少，没有进入这一版' })
      continue
    }
    if (seen.has(key)) {
      removed.push({ evidence: entry, reason: '与前面的要点重复，只保留一条' })
      continue
    }
    seen.add(key)
    unique.push(entry)
  }

  if (unique.length > maxBullets) {
    const ranked = [...unique].sort((left, right) => {
      if (left.relevance !== right.relevance) return left.relevance - right.relevance
      return right.draftIndex - left.draftIndex
    })
    const dropping = new Set(ranked.slice(0, unique.length - maxBullets).map((entry) => entry.bulletId))
    for (const entry of unique) {
      if (dropping.has(entry.bulletId)) {
        removed.push({ evidence: entry, reason: '条目内要点过多，按相关度移出了这一版' })
      }
    }
  }

  return { removed }
}