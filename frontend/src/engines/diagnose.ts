import type {
  DiagnosisCategory,
  DiagnosisIssue,
  Draft,
  SectionKind,
  Severity,
} from '@/domain/types'
import { SECTION_ORDER } from '@/domain/types'
import { assertCleanOutput } from './forbidden'
import {
  findResponsibilityHits,
  findResultSignals,
  findVaguePhrases,
  hasResultSignal,
  hasTechnicalNoun,
} from './signals'
import { findStructureFindings, itemLabel, structureIssueId } from './structure'
import type { DiagnosisResult, EngineContext } from './types'

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

interface PendingIssue {
  ruleId: string
  category: DiagnosisCategory
  severity: Severity
  sectionId: string
  sectionKind: SectionKind
  sectionTitle: string
  itemId: string
  itemLabel: string
  bulletId: string
  quote: string
  highlight: string
  problem: string
  suggestion: string
  sectionIndex: number
  itemIndex: number
  bulletIndex: number
}

const TEMPLATES = {
  responsibility: {
    problem: '这句只写了承担了什么，没有写出做到了什么程度，读者无法判断结果。',
    suggestion: '补上一个可衡量的结果。句式建议：「〈你做的事〉，〈你的指标〉」。',
  },
  vague: {
    problem: '这句用的是笼统评价，没有具体技术名词，也没有可衡量的结果。',
    suggestion:
      '换成具体的技术名词和结果。句式建议：「使用〈具体技术〉完成〈具体事项〉，〈你的指标〉」。',
  },
}

function responsibilityClause(text: string, start: number): string {
  const rest = text.slice(start)
  const stop = rest.search(/[，。；、]/)
  return stop === -1 ? rest : rest.slice(0, stop)
}

export function diagnose(draft: Draft, ctx: EngineContext): DiagnosisResult {
  const pending: PendingIssue[] = []

  for (const finding of findStructureFindings(draft)) {
    pending.push({
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      sectionId: finding.sectionId,
      sectionKind: finding.sectionKind,
      sectionTitle: finding.sectionTitle,
      itemId: finding.itemId,
      itemLabel: finding.itemLabel,
      bulletId: finding.bulletId,
      quote: finding.quote,
      highlight: finding.highlight,
      problem: finding.problem,
      suggestion: finding.suggestion,
      sectionIndex: finding.sectionIndex,
      itemIndex: finding.itemIndex,
      bulletIndex: finding.bulletIndex,
    })
  }

  SECTION_ORDER.forEach((kind, sectionIndex) => {
    const section = draft.sections.find((candidate) => candidate.kind === kind)
    if (!section) return

    section.items.forEach((item, itemIndex) => {
      const label = itemLabel(item.org, item.title)

      item.bullets.forEach((bullet, bulletIndex) => {
        const text = bullet.text
        const hits = findResponsibilityHits(text)

        if (hits.length > 0 && !hasResultSignal(text)) {
          pending.push({
            ruleId: 'responsibility-no-result',
            category: 'responsibility-no-result',
            severity: 'medium',
            sectionId: section.id,
            sectionKind: kind,
            sectionTitle: section.title,
            itemId: item.id,
            itemLabel: label,
            bulletId: bullet.id,
            quote: text,
            highlight: responsibilityClause(text, hits[0]!.start),
            ...TEMPLATES.responsibility,
            sectionIndex,
            itemIndex,
            bulletIndex,
          })
          return
        }

        const vaguePhrases = findVaguePhrases(text)
        if (vaguePhrases.length > 0 && !hasTechnicalNoun(text) && !hasResultSignal(text)) {
          pending.push({
            ruleId: 'vague',
            category: 'vague',
            severity: 'medium',
            sectionId: section.id,
            sectionKind: kind,
            sectionTitle: section.title,
            itemId: item.id,
            itemLabel: label,
            bulletId: bullet.id,
            quote: text,
            highlight: vaguePhrases.join('、'),
            ...TEMPLATES.vague,
            sectionIndex,
            itemIndex,
            bulletIndex,
          })
        }
      })
    })
  })

  pending.sort((left, right) => {
    const bySeverity = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    if (bySeverity !== 0) return bySeverity
    if (left.sectionIndex !== right.sectionIndex) return left.sectionIndex - right.sectionIndex
    if (left.itemIndex !== right.itemIndex) return left.itemIndex - right.itemIndex
    if (left.bulletIndex !== right.bulletIndex) return left.bulletIndex - right.bulletIndex
    return left.bulletId.localeCompare(right.bulletId)
  })

  const issues: DiagnosisIssue[] = pending.map((issue) => {
    assertCleanOutput(`${issue.problem}${issue.suggestion}`, issue.ruleId)
    const anchor = issue.bulletId || issue.itemId || issue.sectionId
    return {
      id: structureIssueId(issue.ruleId, anchor),
      ruleId: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      sectionId: issue.sectionId,
      sectionKind: issue.sectionKind,
      sectionTitle: issue.sectionTitle,
      itemId: issue.itemId,
      itemLabel: issue.itemLabel,
      bulletId: issue.bulletId,
      quote: issue.quote,
      highlight: issue.highlight,
      problem: issue.problem,
      suggestion: issue.suggestion,
    }
  })

  return {
    draftId: draft.id,
    draftRevision: draft.revision,
    contentVersion: 0,
    issues,
    createdAt: ctx.now,
  }
}

export function resultSignalsOf(text: string): string[] {
  return findResultSignals(text)
}
