import type { Draft, Jd, SectionKind } from '@/domain/types'
import { findEntryByTerm, matchCatalog } from './catalog'
import { extractCorePhrases } from './jd'
import { hasResultSignal } from './signals'
import { containsTerm } from './textUtils'
import type { CoverageTier, RequirementCoverage, UncoveredReason } from './types'

const PLANNED_MARKERS = ['计划', '预计', '后续', '将要', '准备', '规划', '拟', '立项', '将在', '即将']

export interface BulletEvidence {
  bulletId: string
  text: string
  sectionId: string
  sectionKind: SectionKind
  itemId: string
  draftIndex: number
  relevance: number
  hasResult: boolean
  planned: boolean
  exactTerms: Set<string>
  relatedByEntry: Map<string, Set<string>>
  approxRequirements: Set<string>
  jdRelated: boolean
}

export function isPlanned(text: string): boolean {
  return PLANNED_MARKERS.some((marker) => text.includes(marker))
}

export function collectEvidence(draft: Draft, jd: Jd): BulletEvidence[] {
  const keywordSet = new Set<string>()
  for (const requirement of jd.requirements) {
    for (const keyword of requirement.keywords) keywordSet.add(keyword)
  }

  const referencedEntries = new Set<string>()
  for (const keyword of keywordSet) {
    const entry = findEntryByTerm(keyword)
    if (entry) referencedEntries.add(entry.id)
  }

  const corePhrasesByRequirement = new Map<string, string[]>()
  for (const requirement of jd.requirements) {
    if (requirement.keywords.length > 0) continue
    corePhrasesByRequirement.set(requirement.id, extractCorePhrases(requirement.text))
  }

  const evidence: BulletEvidence[] = []

  for (const section of draft.sections) {
    for (const item of section.items) {
      item.bullets.forEach((bullet, draftIndex) => {
        const matches = matchCatalog(bullet.text)
        const exactTerms = new Set<string>()
        const relatedByEntry = new Map<string, Set<string>>()
        let otherCount = 0

        for (const match of matches) {
          if (match.kind === 'alias' && keywordSet.has(match.term)) {
            exactTerms.add(match.term)
            continue
          }
          if (match.kind === 'related' && referencedEntries.has(match.entry.id)) {
            const terms = relatedByEntry.get(match.entry.id) ?? new Set<string>()
            terms.add(match.term)
            relatedByEntry.set(match.entry.id, terms)
            continue
          }
          otherCount += 1
        }

        const approxRequirements = new Set<string>()
        for (const [requirementId, phrases] of corePhrasesByRequirement) {
          if (phrases.some((phrase) => containsTerm(bullet.text, phrase))) {
            approxRequirements.add(requirementId)
          }
        }

        const weakCount = [...relatedByEntry.values()].reduce(
          (total, terms) => total + terms.size,
          0,
        )

        evidence.push({
          bulletId: bullet.id,
          text: bullet.text,
          sectionId: section.id,
          sectionKind: section.kind,
          itemId: item.id,
          draftIndex,
          relevance:
            3 * exactTerms.size +
            weakCount +
            approxRequirements.size +
            otherCount +
            (hasResultSignal(bullet.text) ? 2 : 0),
          hasResult: hasResultSignal(bullet.text),
          planned: isPlanned(bullet.text),
          exactTerms,
          relatedByEntry,
          approxRequirements,
          jdRelated: exactTerms.size > 0 || weakCount > 0 || approxRequirements.size > 0,
        })
      })
    }
  }

  return evidence
}

export function requirementWeakMatch(
  entry: BulletEvidence,
  requirement: { id: string; keywords: string[] },
): boolean {
  if (entry.approxRequirements.has(requirement.id)) return true
  for (const keyword of requirement.keywords) {
    const catalogEntry = findEntryByTerm(keyword)
    if (!catalogEntry) continue
    if (entry.relatedByEntry.get(catalogEntry.id)?.size) return true
  }
  return false
}

export function computeCoverage(
  draft: Draft,
  jd: Jd,
  evidence: BulletEvidence[],
): RequirementCoverage[] {
  const items = draft.sections.flatMap((section) => section.items.map((item) => ({ item })))

  return jd.requirements.map((requirement) => {
    const exactHits = evidence.filter((entry) =>
      requirement.keywords.some((keyword) => entry.exactTerms.has(keyword)),
    )
    const weakHits = evidence.filter(
      (entry) => entry.exactTerms.size === 0 && requirementWeakMatch(entry, requirement),
    )
    const metaHits = items.filter(({ item }) => {
      const meta = `${item.org ?? ''} ${item.title ?? ''}`
      return requirement.keywords.some((keyword) => containsTerm(meta, keyword))
    })

    let tier: CoverageTier = 'none'
    let reason: UncoveredReason | null = 'no-match'
    let approximate = false

    if (exactHits.length > 0) {
      const solid = exactHits.filter((entry) => !entry.planned)
      if (solid.length === 0) {
        reason = 'planned-only'
      } else if (solid.some((entry) => entry.hasResult)) {
        tier = 'strong'
        reason = null
      } else {
        tier = 'weak'
        reason = null
      }
    } else if (weakHits.length > 0) {
      const solid = weakHits.filter((entry) => !entry.planned)
      if (solid.length === 0) {
        reason = 'planned-only'
      } else {
        tier = 'weak'
        reason = null
        approximate = weakHits.some((entry) => entry.approxRequirements.has(requirement.id))
      }
    } else if (metaHits.length > 0) {
      tier = 'weak'
      reason = null
    }

    return {
      requirementId: requirement.id,
      text: requirement.text,
      keywords: requirement.keywords,
      tier,
      approximate,
      reason,
      matchedBulletIds: [...exactHits, ...weakHits].map((entry) => entry.bulletId),
    }
  })
}