import { describe, expect, it } from 'vitest'

import type { Draft, DraftItem, SectionKind } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
import { diagnose } from './diagnose'

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

function ruleIdsOf(draft: Draft): string[] {
  return diagnose(draft, CTX).issues.map((issue) => issue.ruleId)
}

describe('diagnose', () => {
  it('reports a bullet that only states a duty', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['负责公司营销活动页面的前端开发'],
        },
      ],
    })
    const issues = diagnose(draft, CTX).issues.filter(
      (issue) => issue.ruleId === 'responsibility-no-result',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.ruleId).toBe('responsibility-no-result')
    expect(issues[0]!.category).toBe('responsibility-no-result')
    expect(issues[0]!.bulletId).toBe('item-1-b1')
    expect(issues[0]!.quote).toBe('负责公司营销活动页面的前端开发')
  })

  it('does not report a bullet that carries a measurable result', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['主导活动平台前端架构升级，页面构建时间从 120s 降到 18s'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('responsibility-no-result')
  })

  it('reports a bullet written in general terms', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['团队协作良好，认真负责，积极向上'],
        },
      ],
    })
    const issues = diagnose(draft, CTX).issues.filter((issue) => issue.ruleId === 'vague')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.ruleId).toBe('vague')
    expect(issues[0]!.highlight).toContain('团队协作')
  })

  it('does not report a bullet that names concrete technologies', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['使用 Vue 3 重写编辑器内核，支持 1000 万字文档编辑'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('vague')
  })

  it('reports an entry without a start date', () => {
    const draft = makeDraft({
      experience: [{ id: 'item-1', org: '美团', title: '前端工程师', bullets: ['推进项目落地'] }],
    })
    expect(ruleIdsOf(draft)).toContain('missing-start')
  })

  it('does not report an entry that has a start date', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('missing-start')
  })

  it('reports an entry whose end date precedes its start date', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2022-01',
          end: '2021-01',
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('end-before-start')
  })

  it('does not report an entry whose dates are in order', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-01',
          end: '2022-01',
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('end-before-start')
  })

  it('reports two overlapping entries inside the experience section', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-01',
          end: '2022-01',
          bullets: ['推进项目落地'],
        },
        {
          id: 'item-2',
          org: '阿里巴巴',
          title: '前端工程师',
          start: '2021-06',
          end: '2022-06',
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('overlapping-experience')
  })

  it('does not report parallel projects as overlapping', () => {
    const draft = makeDraft({
      project: [
        {
          id: 'item-1',
          org: '项目一',
          start: '2021-01',
          end: '2022-01',
          bullets: ['推进项目落地'],
        },
        {
          id: 'item-2',
          org: '项目二',
          start: '2021-06',
          end: '2022-06',
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('overlapping-experience')
  })

  it('reports entries that are not ordered from the most recent one', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '阿里巴巴',
          title: '前端工程师',
          start: '2019-07',
          end: '2021-02',
          bullets: ['推进项目落地'],
        },
        {
          id: 'item-2',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('not-reverse-chronological')
  })

  it('does not report entries ordered from the most recent one', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['推进项目落地'],
        },
        {
          id: 'item-2',
          org: '阿里巴巴',
          title: '前端工程师',
          start: '2019-07',
          end: '2021-02',
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('not-reverse-chronological')
  })

  it('reports an empty section', () => {
    const draft = makeDraft({})
    expect(ruleIdsOf(draft)).toContain('empty-section')
  })

  it('reports an entry without an organisation', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('missing-org')
  })

  it('does not report a project without a position', () => {
    const draft = makeDraft({
      project: [
        {
          id: 'item-1',
          org: '经营数据可视化大屏',
          start: '2022-05',
          end: '2022-11',
          bullets: ['使用 Vue 与 ECharts 实现大屏'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('missing-title')
  })

  it('reports a project without a name', () => {
    const draft = makeDraft({
      project: [
        {
          id: 'item-1',
          start: '2022-05',
          end: '2022-11',
          bullets: ['使用 Vue 与 ECharts 实现大屏'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('missing-org')
  })

  it('reports an entry without a title', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          start: '2021-03',
          present: true,
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('missing-title')
  })

  it('does not report the skills section for a missing organisation or title', () => {
    const draft = makeDraft({
      skills: [{ id: 'item-1', bullets: ['熟悉 Vue 与 React'] }],
    })
    const ids = ruleIdsOf(draft)
    expect(ids).not.toContain('missing-org')
    expect(ids).not.toContain('missing-title')
  })

  it('asks an education entry for a school and a major', () => {
    const draft = makeDraft({
      education: [{ id: 'item-1', start: '2014-09', end: '2018-06', bullets: ['主修数据结构'] }],
    })
    const issues = diagnose(draft, CTX).issues
    const missingOrg = issues.find((issue) => issue.ruleId === 'missing-org')!
    const missingTitle = issues.find((issue) => issue.ruleId === 'missing-title')!
    expect(missingOrg.problem).toContain('学校名称')
    expect(missingOrg.problem).not.toContain('公司')
    expect(missingTitle.problem).toContain('专业')
  })

  it('asks a work entry for a company and a position', () => {
    const draft = makeDraft({
      experience: [{ id: 'item-1', start: '2021-03', present: true, bullets: ['推进项目落地'] }],
    })
    const issues = diagnose(draft, CTX).issues
    expect(issues.find((issue) => issue.ruleId === 'missing-org')!.problem).toContain('公司名称')
    expect(issues.find((issue) => issue.ruleId === 'missing-title')!.problem).toContain('职位')
  })

  it('reports an entry without any bullet', () => {
    const draft = makeDraft({
      experience: [
        { id: 'item-1', org: '美团', title: '前端工程师', start: '2021-03', present: true },
      ],
    })
    expect(ruleIdsOf(draft)).toContain('no-bullets')
  })

  it('does not report an entry that carries bullets', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['推进项目落地'],
        },
      ],
    })
    expect(ruleIdsOf(draft)).not.toContain('no-bullets')
  })

  it('keeps the document order inside one severity', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['负责页面开发', '团队协作良好，认真负责'],
        },
      ],
    })
    const issues = diagnose(draft, CTX).issues.filter((issue) => issue.bulletId !== '')
    expect(issues.map((issue) => issue.bulletId)).toEqual(['item-1-b1', 'item-1-b2'])
  })

  it('sorts the issues by severity from high to low', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          bullets: ['负责页面开发'],
        },
      ],
    })
    const issues = diagnose(draft, CTX).issues
    const rank = { high: 0, medium: 1, low: 2 }
    const ranks = issues.map((issue) => rank[issue.severity])
    expect([...ranks].sort((left, right) => left - right)).toEqual(ranks)
  })

  it('offers a template with a placeholder instead of a concrete number', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['负责页面开发'],
        },
      ],
    })
    for (const issue of diagnose(draft, CTX).issues) {
      expect(issue.suggestion).toContain('〈')
      expect(issue.suggestion).not.toMatch(/\d/)
    }
  })

  it('keeps every suggestion free of the forbidden words', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          bullets: ['负责页面开发', '团队协作良好'],
        },
      ],
    })
    for (const issue of diagnose(draft, CTX).issues) {
      expect(`${issue.problem}${issue.suggestion}`).not.toMatch(/面试|笔试|八股|考点|题库|刷题|真题|面经/)
    }
  })

  it('does not expose any score or total', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          bullets: ['负责页面开发'],
        },
      ],
    })
    const result = diagnose(draft, CTX)
    const keys = [
      ...Object.keys(result),
      ...result.issues.flatMap((issue) => Object.keys(issue)),
    ]
    for (const key of keys) {
      expect(key).not.toMatch(/score|total|rating|grade|总分|评分|分数/)
    }
  })

  it('returns the same issues for the same draft', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          bullets: ['负责页面开发'],
        },
      ],
    })
    expect(JSON.stringify(diagnose(draft, CTX).issues)).toBe(
      JSON.stringify(diagnose(draft, CTX).issues),
    )
  })
})
