import { createIdSeed, type IdSeed } from '../domain/ids'
import type {
  DiffEntry,
  Draft,
  DraftItem,
  DraftSection,
  IntegrityViolation,
  Jd,
  ResumeVersion,
  VersionBullet,
  VersionItem,
  VersionSection,
} from '../domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '../domain/types'
import { assertCleanOutput } from './forbidden'
import { parseJd } from './jd'
import { applyTransforms, assertNoFactsAdded } from './transforms'
import {
  collectEvidence,
  computeCoverage,
  type BulletEvidence,
} from './coverage'
import { DEFAULT_MAX_BULLETS, orderBullets, trimBullets, type RemovedBullet } from './ordering'
import {
  assembleBody,
  buildUncovered,
  diffReason,
  itemLabel,
  tierRank,
} from './versionAssembly'
import type {
  EngineContext,
  GenerateOptions,
  GenerateVersionResult,
  RequirementCoverage,
} from './types'

interface PlannedItem {
  item: DraftItem
  section: DraftSection
  all: BulletEvidence[]
  ordered: BulletEvidence[]
  tailIds: Set<string>
  removed: RemovedBullet[]
  droppedWhole: boolean
}

export function evaluateJd(draft: Draft, jd: Jd, _ctx: EngineContext): RequirementCoverage[] {
  return computeCoverage(draft, jd, collectEvidence(draft, jd))
}

export function generateVersion(
  draft: Draft,
  jdText: string,
  ctx: EngineContext,
  options: GenerateOptions = {},
  seed: IdSeed = createIdSeed(),
): GenerateVersionResult {
  const {
    versionName,
    existingVersionCount = 0,
    dropIrrelevantProjects = true,
    allowVerbFronting = true,
    maxBulletsPerItem = DEFAULT_MAX_BULLETS,
  } = options

  const { jd } = parseJd(jdText, ctx, seed, existingVersionCount)

  const evidence = collectEvidence(draft, jd)
  const evidenceByItem = new Map<string, BulletEvidence[]>()
  for (const entry of evidence) {
    const list = evidenceByItem.get(entry.itemId) ?? []
    list.push(entry)
    evidenceByItem.set(entry.itemId, list)
  }

  const baselineCoverage = computeCoverage(draft, jd, evidence)

  const projectSection = draft.sections.find((section) => section.kind === 'project')
  const planned: PlannedItem[] = []

  for (const section of draft.sections) {
    for (const item of section.items) {
      const itemEvidence = evidenceByItem.get(item.id) ?? []
      const { ordered, tailIds } = orderBullets(itemEvidence)
      const { removed } = trimBullets(ordered, maxBulletsPerItem)

      const allIrrelevant =
        itemEvidence.length > 0 && itemEvidence.every((entry) => entry.relevance === 0)
      const droppedWhole =
        dropIrrelevantProjects &&
        section.kind === 'project' &&
        (projectSection?.items.length ?? 0) >= 2 &&
        allIrrelevant

      planned.push({
        item,
        section,
        all: itemEvidence,
        ordered,
        tailIds,
        removed,
        droppedWhole,
      })
    }
  }

  const draftWith = (items: PlannedItem[]): Draft => ({
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      items: items
        .filter((entry) => entry.section.id === section.id && !entry.droppedWhole)
        .map((entry) => ({
          ...entry.item,
          bullets: entry.ordered
            .filter((bullet) => !entry.removed.some((removal) => removal.evidence.bulletId === bullet.bulletId))
            .map((bullet) => ({ id: bullet.bulletId, text: bullet.text })),
        })),
    })),
  })

  const degradedCount = (items: PlannedItem[]): number => {
    const snapshot = draftWith(items)
    const coverage = computeCoverage(snapshot, jd, collectEvidence(snapshot, jd))
    return coverage.filter(
      (entry, index) =>
        baselineCoverage[index] && tierRank(baselineCoverage[index]!.tier) > tierRank(entry.tier),
    ).length
  }

  // 覆盖保护闸门：删减后若某项要求的覆盖级别下降，回滚移除。
  const rollbackCandidates = planned
    .flatMap((entry) => entry.removed.map((removal) => ({ itemId: entry.item.id, removal })))
    .sort((left, right) => right.removal.evidence.relevance - left.removal.evidence.relevance)

  let current = planned
  let currentDegraded = degradedCount(current)

  for (const candidate of rollbackCandidates) {
    if (currentDegraded === 0) break
    const trial = current.map((entry) =>
      entry.item.id === candidate.itemId
        ? { ...entry, removed: entry.removed.filter((removal) => removal !== candidate.removal) }
        : entry,
    )
    const trialDegraded = degradedCount(trial)
    if (trialDegraded < currentDegraded) {
      current = trial
      currentDegraded = trialDegraded
    }
  }

  const integrityViolations: IntegrityViolation[] = []
  let checked = 0

  const versionSections: VersionSection[] = []
  const diffEntries: DiffEntry[] = []

  for (const kind of SECTION_ORDER) {
    // 底稿里没有这个分区就不生成——否则老版本会多出一个空的「其它」
    if (!draft.sections.some((section) => section.kind === kind)) continue

    const versionItems: VersionItem[] = []

    for (const entry of current.filter((item) => item.section.kind === kind)) {
      const removedIds = new Set(entry.removed.map((removal) => removal.evidence.bulletId))
      const kept = entry.ordered.filter((bullet) => !removedIds.has(bullet.bulletId))
      const keptIndexById = new Map(kept.map((bullet, index) => [bullet.bulletId, index]))

      const bullets: VersionBullet[] = []
      kept.forEach((bullet) => {
        const transformed = applyTransforms(bullet.text, { allowVerbFronting })
        const metadata = `${entry.item.org ?? ''} ${entry.item.title ?? ''}`
        const violations = assertNoFactsAdded(bullet.text, transformed, { metadata })
        checked += 1

        let finalText = transformed
        if (violations.length > 0) {
          finalText = bullet.text
          integrityViolations.push({
            bulletId: bullet.bulletId,
            reason: violations.join('；'),
            originalText: bullet.text,
            revertedText: finalText,
          })
        }

        bullets.push({ id: bullet.bulletId, text: finalText })
      })

      const diffByBulletId = new Map<string, DiffEntry>()

      for (const bullet of entry.all) {
        const base = {
          bulletId: bullet.bulletId,
          sectionId: entry.section.id,
          sectionKind: kind,
          sectionTitle: entry.section.title,
          itemId: entry.item.id,
          itemLabel: itemLabel(entry.item),
        }

        if (entry.droppedWhole) {
          diffByBulletId.set(bullet.bulletId, {
            ...base,
            change: 'remove',
            placement: 'same',
            fromText: bullet.text,
            toText: null,
            toIndex: null,
            reason: '整条项目与该 JD 无关，没有进入这一版',
          })
          continue
        }

        const keptIndex = keptIndexById.get(bullet.bulletId)
        if (keptIndex === undefined) {
          const removal = entry.removed.find((candidate) => candidate.evidence.bulletId === bullet.bulletId)
          diffByBulletId.set(bullet.bulletId, {
            ...base,
            change: 'remove',
            placement: 'same',
            fromText: bullet.text,
            toText: null,
            toIndex: null,
            reason: removal?.reason ?? '没有进入这一版',
          })
          continue
        }

        const versionBullet = bullets[keptIndex]!
        const inTail = entry.tailIds.has(bullet.bulletId)
        const placement = inTail ? 'to-end' : 'same'
        const change = versionBullet.text === bullet.text ? 'keep' : 'rewrite'
        diffByBulletId.set(bullet.bulletId, {
          ...base,
          change,
          placement,
          fromText: bullet.text,
          toText: versionBullet.text,
          toIndex: keptIndex,
          reason: diffReason({ change, placement }),
        })
      }

      for (const bullet of entry.all) {
        const diff = diffByBulletId.get(bullet.bulletId)
        if (diff) diffEntries.push(diff)
      }

      if (entry.droppedWhole) continue

      versionItems.push({
        id: entry.item.id,
        org: entry.item.org,
        title: entry.item.title,
        start: entry.item.start,
        end: entry.item.end,
        present: entry.item.present,
        bullets,
      })
    }

    versionSections.push({ kind, title: SECTION_TITLES[kind], items: versionItems })
  }

  const finalCoverage = computeCoverage(draft, jd, evidence)
  const uncovered = buildUncovered(finalCoverage, jd)
  const profile = {
    name: draft.profile?.name ?? '',
    headline: draft.profile?.headline ?? '',
    contacts: [...(draft.profile?.contacts ?? [])],
  }
  const body = assembleBody(versionSections, profile)

  assertCleanOutput(body, '版本正文')

  const version: ResumeVersion = {
    id: seed.next('version'),
    userId: draft.userId,
    name: versionName?.trim() || jd.roleName,
    profile,
    jdRawText: jdText,
    jdRoleName: jd.roleName,
    draftRevision: draft.revision,
    createdAt: ctx.now,
    body,
    sections: versionSections,
    diff: diffEntries,
    uncovered,
    coverage: finalCoverage,
    integrity: { checked, violations: integrityViolations },
    engineVersion: ctx.engineVersion,
  }

  return { version, coverage: finalCoverage }
}
