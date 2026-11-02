import { describe, expect, it } from 'vitest'

import type { Draft, DraftItem, SectionKind } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
import { diagnose } from './diagnose'
import { findStructureFindings, structureIssueId } from './structure'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

interface ItemSpec {
  id: string
  org?: string
  title?: string
  start?: string | null
  end?: string | null
  present?: boolean
  bullets?: string[]
}

function makeItem(spec: ItemSpec): DraftItem {
  return {
    id: spec.id,
    org: spec.org,
    title: spec.title,
    start: spec.start ?? null,
    end: spec.end ?? null,
    present: spec.present ?? false,
    bullets: (spec.bullets ?? []).map((text, index) => ({
      id: `${spec.id}-b${index + 1}`,
      text,
    })),
  }
}

function makeDraft(sections: Partial<Record<SectionKind, ItemSpec[]>>): Draft {
  return {
    id: 'draft-1',
    userId: 'user-1',
    revision: 3,
    profile: { name: '', headline: '', contacts: [] },
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: SECTION_ORDER.map((kind) => ({
      id: `sec-${kind}`,
      kind,
      title: SECTION_TITLES[kind],
      items: (sections[kind] ?? []).map(makeItem),
    })),
  }
}

describe('findStructureFindings', () => {
  it('finds a missing org, title and start', () => {
    const findings = findStructureFindings(
      makeDraft({ experience: [{ id: 'item-1', bullets: ['做了一些事'] }] }),
    )
    const rules = findings.map((finding) => finding.ruleId)
    expect(rules).toContain('missing-org')
    expect(rules).toContain('missing-title')
    expect(rules).toContain('missing-start')
  })

  it('names the fields the section actually uses', () => {
    const findings = findStructureFindings(
      makeDraft({ education: [{ id: 'item-1', start: '2014-09', bullets: ['主修课程'] }] }),
    )
    const missingOrg = findings.find((finding) => finding.ruleId === 'missing-org')!
    const missingTitle = findings.find((finding) => finding.ruleId === 'missing-title')!
    expect(missingOrg.label).toBe('缺少学校名称')
    expect(missingTitle.label).toBe('缺少专业')
    expect(missingOrg.problem).toContain('学校名称')
    expect(missingOrg.problem).not.toContain('公司')
  })

  it('names the experience fields the way the section does', () => {
    const findings = findStructureFindings(
      makeDraft({ experience: [{ id: 'item-1', bullets: ['做了一些事'] }] }),
    )
    expect(findings.find((finding) => finding.ruleId === 'missing-org')!.label).toBe('缺少公司名称')
    expect(findings.find((finding) => finding.ruleId === 'missing-title')!.label).toBe('缺少职位')
  })

  it('reports an empty section', () => {
    const findings = findStructureFindings(makeDraft({ project: [] }))
    const empty = findings.find((finding) => finding.ruleId === 'empty-section')!
    expect(empty.label).toBe('分区为空')
    expect(empty.itemId).toBe('')
  })

  it('reports an item without bullets', () => {
    const findings = findStructureFindings(
      makeDraft({
        experience: [{ id: 'item-1', org: '美团', title: '前端工程师', start: '2021-03' }],
      }),
    )
    expect(findings.find((finding) => finding.ruleId === 'no-bullets')!.label).toBe('没有要点')
  })

  it('reports timeline problems', () => {
    const findings = findStructureFindings(
      makeDraft({
        experience: [
          { id: 'item-1', org: '甲', title: '工程师', start: '2018-01', bullets: ['做过事'] },
          { id: 'item-2', org: '乙', title: '工程师', start: '2021-03', bullets: ['做过事'] },
          { id: 'item-3', org: '丙', title: '工程师', start: '2022-01', end: '2021-01', bullets: ['做过事'] },
        ],
      }),
    )
    const rules = findings.map((finding) => finding.ruleId)
    expect(rules).toContain('not-reverse-chronological')
    expect(rules).toContain('end-before-start')
  })

  it('tells which field each problem should be fixed in', () => {
    const findings = findStructureFindings(
      makeDraft({ experience: [{ id: 'item-1', bullets: ['做过一些事'] }] }),
    )
    const fieldOf = (ruleId: string) => findings.find((f) => f.ruleId === ruleId)?.field
    expect(fieldOf('missing-org')).toBe('org')
    expect(fieldOf('missing-title')).toBe('title')
    expect(fieldOf('missing-start')).toBe('start')
  })

  it('points at the end date when the end is before the start', () => {
    const findings = findStructureFindings(
      makeDraft({
        experience: [
          {
            id: 'item-1',
            org: '甲',
            title: '工程师',
            start: '2022-01',
            end: '2021-01',
            bullets: ['做过事'],
          },
        ],
      }),
    )
    expect(findings.find((f) => f.ruleId === 'end-before-start')!.field).toBe('end')
  })

  it('does not ask the skills section for a company or a title', () => {
    const findings = findStructureFindings(
      makeDraft({ skills: [{ id: 'item-1', bullets: ['Vue', 'TypeScript'] }] }),
    )
    const rules = findings.map((finding) => finding.ruleId)
    expect(rules).not.toContain('missing-org')
    expect(rules).not.toContain('missing-title')
    expect(rules).not.toContain('missing-start')
  })

  it('gives the same structure issues as the diagnosis engine', () => {
    const draft = makeDraft({
      education: [{ id: 'item-1', start: '2014-09', bullets: ['主修课程'] }],
      experience: [
        { id: 'item-2', org: '甲', title: '工程师', start: '2021-03', bullets: ['做过事'] },
        { id: 'item-3', org: '乙', title: '工程师', start: '2019-01', bullets: ['做过事'] },
      ],
      project: [],
    })
    const findings = findStructureFindings(draft)
    const diagnosed = diagnose(draft, CTX).issues.filter((issue) => issue.category === 'structure')

    expect(diagnosed).toHaveLength(findings.length)
    for (const finding of findings) {
      const anchor = finding.itemId || finding.sectionId
      const issue = diagnosed.find(
        (entry) => entry.id === structureIssueId(finding.ruleId, anchor),
      )
      expect(issue).toBeDefined()
      expect(issue!.problem).toBe(finding.problem)
      expect(issue!.suggestion).toBe(finding.suggestion)
      expect(issue!.severity).toBe(finding.severity)
    }
  })
})
