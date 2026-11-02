import { describe, expect, it } from 'vitest'

import type { DiagnosisIssue, Draft } from '@/domain/types'
import { anchorLevel, anchorText, orderByDocument } from './anchor'

const DRAFT: Draft = {
  id: 'draft-1',
  userId: 'user-1',
  revision: 1,
  profile: { name: '', headline: '', contacts: [] },
  updatedAt: '2026-01-01T00:00:00.000Z',
  sections: [
    {
      id: 'sec-education',
      kind: 'education',
      title: '教育背景',
      items: [
        {
          id: 'item-edu',
          org: '清华大学',
          title: '计算机科学与技术',
          start: '2015-09',
          end: '2018-06',
          bullets: [{ id: 'bullet-edu', text: '主修数据结构' }],
        },
      ],
    },
    {
      id: 'sec-experience',
      kind: 'experience',
      title: '工作经历',
      items: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          end: null,
          present: true,
          bullets: [
            { id: 'bullet-1', text: '负责公司营销活动页面的前端开发' },
            { id: 'bullet-2', text: '主导活动平台前端架构升级' },
          ],
        },
      ],
    },
  ],
}

function issue(patch: Partial<DiagnosisIssue>): DiagnosisIssue {
  return {
    id: 'issue-1',
    ruleId: 'rule',
    category: 'vague',
    severity: 'medium',
    sectionId: 'sec-experience',
    sectionKind: 'experience',
    sectionTitle: '工作经历',
    itemId: 'item-1',
    itemLabel: '美团 · 前端工程师',
    bulletId: 'bullet-1',
    quote: '负责公司营销活动页面的前端开发',
    highlight: '负责公司营销活动页面的前端开发',
    problem: '问题',
    suggestion: '建议',
    ...patch,
  }
}

describe('anchorLevel', () => {
  it('is bullet level when the issue points at a bullet', () => {
    expect(anchorLevel(issue({ bulletId: 'bullet-1' }))).toBe('bullet')
  })

  it('is item level when the issue points at an entry', () => {
    expect(anchorLevel(issue({ bulletId: '' }))).toBe('item')
  })

  it('is section level when the issue points at a section', () => {
    expect(anchorLevel(issue({ bulletId: '', itemId: '' }))).toBe('section')
  })
})

describe('anchorText', () => {
  it('anchors a bullet issue at the problematic fragment', () => {
    expect(anchorText(issue({ highlight: '负责开发' }))).toBe('负责开发')
  })

  it('falls back to the whole bullet when no fragment can be identified', () => {
    expect(anchorText(issue({ highlight: '', quote: '整条要点' }))).toBe('整条要点')
  })

  it('anchors an item issue at the entry heading', () => {
    expect(anchorText(issue({ bulletId: '', itemLabel: '美团 · 前端工程师' }))).toBe('美团 · 前端工程师')
  })

  it('anchors a section issue at the section title', () => {
    expect(anchorText(issue({ bulletId: '', itemId: '', sectionTitle: '工作经历' }))).toBe('工作经历')
  })
})

describe('orderByDocument', () => {
  it('orders issues by where they appear in the resume', () => {
    const issues = [
      issue({ id: 'a', bulletId: 'bullet-2', itemId: 'item-1', sectionId: 'sec-experience' }),
      issue({ id: 'b', bulletId: 'bullet-edu', itemId: 'item-edu', sectionId: 'sec-education' }),
      issue({ id: 'c', bulletId: '', itemId: 'item-1', sectionId: 'sec-experience' }),
    ]
    expect(orderByDocument(DRAFT, issues).map((entry) => entry.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps the order of issues that share the same anchor', () => {
    const issues = [
      issue({ id: 'a', bulletId: 'bullet-1' }),
      issue({ id: 'b', bulletId: 'bullet-1' }),
    ]
    expect(orderByDocument(DRAFT, issues).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('puts an entry level issue before the bullets of that entry', () => {
    const issues = [
      issue({ id: 'a', bulletId: 'bullet-1' }),
      issue({ id: 'b', bulletId: '', itemId: 'item-1' }),
    ]
    expect(orderByDocument(DRAFT, issues).map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})
