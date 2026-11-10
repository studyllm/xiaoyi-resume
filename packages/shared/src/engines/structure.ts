import type { Draft, DraftItem, SectionKind, Severity } from '../domain/types'
import { hasItemHead, SECTION_ORDER } from '../domain/types'
import { SECTION_FIELD_WORDS } from '../domain/sectionFields'
import { compareYearMonth, rangesOverlap } from '../domain/time'

/**
 * 结构类问题只有这一处判断。诊断意见与纸面上的结构标注都从这里取，
 * 免得两处各说各话。
 */
export type StructureRuleId =
  | 'empty-section'
  | 'missing-org'
  | 'missing-title'
  | 'no-bullets'
  | 'missing-start'
  | 'end-before-start'
  | 'not-reverse-chronological'
  | 'overlapping-experience'

export interface StructureFinding {
  ruleId: StructureRuleId
  category: 'structure'
  severity: Severity
  sectionId: string
  sectionKind: SectionKind
  sectionTitle: string
  itemId: string
  itemLabel: string
  bulletId: string
  quote: string
  highlight: string
  /** 诊断意见里的问题说明 */
  problem: string
  /** 诊断意见里的改写建议 */
  suggestion: string
  /** 纸面上的短标注，如「缺少开始时间」 */
  label: string
  /** 该在哪个格子里补。条目级与分区级的问题没有指向具体字段。 */
  field?: 'org' | 'title' | 'start' | 'end'
  sectionIndex: number
  itemIndex: number
  bulletIndex: number
}

const TEMPLATES = {
  missingStart: {
    problem: '这段经历没有开始时间，时间线无法核对。',
    suggestion: '补上开始时间。句式建议：「〈开始年月〉 - 〈结束年月〉」。',
    label: '缺少开始时间',
    field: 'start',
  },
  endBeforeStart: {
    problem: '结束时间早于开始时间，这段时间对不上。',
    suggestion: '核对并修正这段时间。句式建议：「〈开始年月〉 - 〈结束年月〉」。',
    label: '结束时间早于开始时间',
    field: 'end',
  },
  overlapping: {
    problem: '这段经历与前面某段经历的时间区间有重叠。',
    suggestion: '如果两段经历确实同时进行，说明各自的投入方式。句式建议：「〈这段时间〉期间〈投入方式〉」。',
    label: '时间有重叠',
  },
  notReverseChronological: {
    problem: '同一分区里，这段经历没有按时间倒序排列。',
    suggestion: '把最近的一段排在前面。句式建议：按〈起止年月〉倒序排列。',
    label: '没有按时间倒序',
  },
  emptySection: {
    problem: '这个分区目前是空的。',
    suggestion: '如果确实有内容，句式建议：「〈分区名称〉：〈条目名称〉」；否则可以留空。',
    label: '分区为空',
  },
  noBullets: {
    problem: '这个条目下面没有任何要点。',
    suggestion: '补上这个条目的要点。句式建议：「· 〈你做的事〉，〈你的指标〉」。',
    label: '没有要点',
  },
} as const

/** 缺字段的意见按分区换词：教育经历问学校与专业，工作经历问公司与职位。 */
function missingOrgWords(kind: SectionKind): {
  problem: string
  suggestion: string
  label: string
  field: 'org'
} {
  const words = SECTION_FIELD_WORDS[kind]
  return {
    problem: `${words.itemNoun}没有${words.org}。`,
    suggestion: `补上${words.org}。句式建议：「〈${words.org}〉 〈${words.title}〉 〈起止年月〉」。`,
    label: `缺少${words.org}`,
    field: 'org',
  }
}

function missingTitleWords(kind: SectionKind): {
  problem: string
  suggestion: string
  label: string
  field: 'title'
} {
  const words = SECTION_FIELD_WORDS[kind]
  return {
    problem: `${words.itemNoun}没有${words.title}。`,
    suggestion: `补上${words.title}。句式建议：「〈${words.org}〉 〈${words.title}〉 〈起止年月〉」。`,
    label: `缺少${words.title}`,
    field: 'title',
  }
}

export function itemLabel(org?: string, title?: string): string {
  if (org && title) return `${org} · ${title}`
  return org ?? title ?? ''
}

/**
 * 条目标签：机构与职位都没有时，用第一条要点开头。
 *
 * 「未命名的条目」对用户毫无用处——他既认不出那是哪一段，也就没法判断是
 * 自己漏写了还是解析没认出来。给出要点开头，至少能对上。
 */
function labelWithFallback(item: DraftItem): string {
  const label = itemLabel(item.org, item.title)
  if (label) return label
  const first = item.bullets[0]?.text.trim() ?? ''
  if (!first) return ''
  return first.length > 24 ? `${first.slice(0, 24)}…` : first
}

/** 意见 id 的统一写法，纸面标注用它去找右侧对应的意见。 */
export function structureIssueId(ruleId: string, anchor: string): string {
  return `${ruleId}@${anchor}`
}

export function findStructureFindings(draft: Draft): StructureFinding[] {
  const findings: StructureFinding[] = []

  SECTION_ORDER.forEach((kind, sectionIndex) => {
    const section = draft.sections.find((candidate) => candidate.kind === kind)
    if (!section) return

    // 「其它」是可选的，空着不算问题
    if (section.items.length === 0 && kind !== 'other') {
      findings.push({
        ruleId: 'empty-section',
        category: 'structure',
        severity: 'low',
        sectionId: section.id,
        sectionKind: kind,
        sectionTitle: section.title,
        itemId: '',
        itemLabel: '',
        bulletId: '',
        quote: `「${section.title}」分区`,
        highlight: section.title,
        ...TEMPLATES.emptySection,
        sectionIndex,
        itemIndex: -1,
        bulletIndex: -1,
      })
      return
    }

    section.items.forEach((item, itemIndex) => {
      const label = labelWithFallback(item)

      if (hasItemHead(kind)) {
        if (!item.org) {
          findings.push({
            ruleId: 'missing-org',
            category: 'structure',
            severity: 'medium',
            sectionId: section.id,
            sectionKind: kind,
            sectionTitle: section.title,
            itemId: item.id,
            itemLabel: label,
            bulletId: '',
            quote: label || '未命名的条目',
            highlight: '',
            ...missingOrgWords(kind),
            sectionIndex,
            itemIndex,
            bulletIndex: -1,
          })
        }
        if (!item.title && kind !== 'project') {
          findings.push({
            ruleId: 'missing-title',
            category: 'structure',
            severity: 'medium',
            sectionId: section.id,
            sectionKind: kind,
            sectionTitle: section.title,
            itemId: item.id,
            itemLabel: label,
            bulletId: '',
            quote: label || '未命名的条目',
            highlight: '',
            ...missingTitleWords(kind),
            sectionIndex,
            itemIndex,
            bulletIndex: -1,
          })
        }
      }

      if (item.bullets.length === 0) {
        findings.push({
          ruleId: 'no-bullets',
          category: 'structure',
          severity: 'low',
          sectionId: section.id,
          sectionKind: kind,
          sectionTitle: section.title,
          itemId: item.id,
          itemLabel: label,
          bulletId: '',
          quote: label || '未命名的条目',
          highlight: '',
          ...TEMPLATES.noBullets,
          sectionIndex,
          itemIndex,
          bulletIndex: -1,
        })
      }

      if (hasItemHead(kind)) {
        if (!item.start) {
          findings.push({
            ruleId: 'missing-start',
            category: 'structure',
            severity: 'high',
            sectionId: section.id,
            sectionKind: kind,
            sectionTitle: section.title,
            itemId: item.id,
            itemLabel: label,
            bulletId: '',
            quote: label || '未命名的条目',
            highlight: '',
            ...TEMPLATES.missingStart,
            sectionIndex,
            itemIndex,
            bulletIndex: -1,
          })
        } else if (item.end && compareYearMonth(item.end, item.start) < 0) {
          findings.push({
            ruleId: 'end-before-start',
            category: 'structure',
            severity: 'high',
            sectionId: section.id,
            sectionKind: kind,
            sectionTitle: section.title,
            itemId: item.id,
            itemLabel: label,
            bulletId: '',
            quote: label || '未命名的条目',
            highlight: '',
            ...TEMPLATES.endBeforeStart,
            sectionIndex,
            itemIndex,
            bulletIndex: -1,
          })
        }
      }
    })

    if (hasItemHead(kind)) {
      collectTimelineFindings(section, kind, sectionIndex, findings)
    }
  })

  return findings
}

function collectTimelineFindings(
  section: Draft['sections'][number],
  kind: SectionKind,
  sectionIndex: number,
  findings: StructureFinding[],
): void {
  const dated = section.items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter((entry) => entry.item.start)

  for (let index = 1; index < dated.length; index += 1) {
    const previous = dated[index - 1]!
    const current = dated[index]!
    if (compareYearMonth(current.item.start!, previous.item.start!) > 0) {
      findings.push({
        ruleId: 'not-reverse-chronological',
        category: 'structure',
        severity: 'medium',
        sectionId: section.id,
        sectionKind: kind,
        sectionTitle: section.title,
        itemId: current.item.id,
        itemLabel: itemLabel(current.item.org, current.item.title),
        bulletId: '',
        quote: itemLabel(current.item.org, current.item.title),
        highlight: '',
        ...TEMPLATES.notReverseChronological,
        sectionIndex,
        itemIndex: current.itemIndex,
        bulletIndex: -1,
      })
    }
  }

  if (kind !== 'experience') return

  for (let index = 0; index < section.items.length; index += 1) {
    for (let other = index + 1; other < section.items.length; other += 1) {
      const left = section.items[index]!
      const right = section.items[other]!
      if (!left.start || !right.start) continue

      const leftRange = { start: left.start, end: left.end ?? null, present: left.present ?? false }
      const rightRange = { start: right.start, end: right.end ?? null, present: right.present ?? false }
      if (!rangesOverlap(leftRange, rightRange)) continue

      findings.push({
        ruleId: 'overlapping-experience',
        category: 'structure',
        severity: 'high',
        sectionId: section.id,
        sectionKind: kind,
        sectionTitle: section.title,
        itemId: right.id,
        itemLabel: itemLabel(right.org, right.title),
        bulletId: '',
        quote: itemLabel(right.org, right.title),
        highlight: '',
        ...TEMPLATES.overlapping,
        sectionIndex,
        itemIndex: other,
        bulletIndex: -1,
      })
    }
  }
}
