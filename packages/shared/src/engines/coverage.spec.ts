import { describe, expect, it } from 'vitest'

import { createIdSeed } from '../domain/ids'
import type { Draft, DraftItem, SectionKind } from '../domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '../domain/types'
import { collectEvidence, computeCoverage, matchRequirement } from './coverage'
import { parseJd } from './jd'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

const JD = `前端工程师

任职要求：
1. 精通 Vue 和 TypeScript
2. 熟悉 Docker 与 CI/CD 流程
`

interface ItemSpec {
  id: string
  org?: string
  title?: string
  bullets?: string[]
}

function makeItem(spec: ItemSpec): DraftItem {
  return {
    id: spec.id,
    org: spec.org,
    title: spec.title,
    start: null,
    end: null,
    present: false,
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
    revision: 1,
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

const DRAFT = makeDraft({
  experience: [
    {
      id: 'item-1',
      org: '美团',
      title: '前端工程师',
      bullets: ['主导活动平台前端架构升级，引入 Vue 3，覆盖 30 个业务线', '负责容器镜像构建与 CI/CD 流程接入'],
    },
  ],
})

describe('覆盖判定', () => {
  it('逐条算出来的和整体算出来的完全一样', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const evidence = collectEvidence(DRAFT, jd)

    const whole = computeCoverage(DRAFT, jd, evidence)
    const oneByOne = jd.requirements.map((requirement) =>
      matchRequirement(DRAFT, requirement, evidence),
    )

    // 单条拆出来是为了模型路径复核用——规则路径的产物不能因此变样
    expect(oneByOne).toEqual(whole)
  })

  it('命中关键词且有结果信号的判为强覆盖', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const evidence = collectEvidence(DRAFT, jd)

    const coverage = computeCoverage(DRAFT, jd, evidence)

    expect(coverage.length).toBeGreaterThan(0)
    expect(coverage.some((entry) => entry.tier === 'strong')).toBe(true)
  })

  it('简历里没有对应事实的判为未覆盖', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const empty = makeDraft({})
    const evidence = collectEvidence(empty, jd)

    const coverage = computeCoverage(empty, jd, evidence)

    expect(coverage.every((entry) => entry.tier === 'none')).toBe(true)
    expect(coverage.every((entry) => entry.reason === 'no-match')).toBe(true)
  })

  it('命中的要点全是规划性表述的按没有对应事实处理', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          bullets: ['计划在后续版本里引入 Vue 3，覆盖 30 个业务线'],
        },
      ],
    })
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const evidence = collectEvidence(draft, jd)

    const coverage = computeCoverage(draft, jd, evidence)
    const vue = coverage.find((entry) => entry.text.includes('Vue'))

    expect(vue?.tier).toBe('none')
    expect(vue?.reason).toBe('planned-only')
  })
})
