import { describe, expect, it } from 'vitest'

import type { Draft, DraftItem, SectionKind } from '../domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '../domain/types'
import { buildExplain } from './explain'
import { rulesGenerator } from './generator'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

const JD = `前端工程师

任职要求：
1. 熟悉 Vue 与 Vite
2. 有组件库建设经验
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
    present: true,
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
      bullets: ['主导活动平台前端架构升级，引入 Vue 3 与 Vite'],
    },
  ],
})

async function makeVersion() {
  const result = await rulesGenerator.generate(DRAFT, JD, CTX)
  return result.version
}

describe('生成经过怎么组装', () => {
  it('每条要点都有一条取舍记录', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: null,
      scope: { comparedBullets: 1, totalBullets: 1 },
      calls: [],
    })

    expect(explain.bullets).toHaveLength(version.diff.length)
  })

  it('每条要点都能指出它命中了哪几条要求', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: null,
      scope: { comparedBullets: 1, totalBullets: 1 },
      calls: [],
    })

    const covered = explain.bullets.filter((entry) => entry.matchedRequirements.length > 0)
    expect(covered.length).toBeGreaterThan(0)
    expect(covered[0]!.matchedRequirements[0]).toContain('Vue')
  })

  it('没参与比对的要点说清原因', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: {
        comparedBulletIds: [],
        dropped: [{ bulletId: 'item-1-b1', reason: '与该岗位无关，没有参与比对' }],
      },
      scope: { comparedBullets: 0, totalBullets: 1 },
      calls: [],
    })

    expect(explain.bullets[0]!.compared).toBe(false)
    expect(explain.bullets[0]!.reason).toContain('与该岗位无关')
  })

  it('没有筛选过时，全部要点都算参与过比对', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: null,
      scope: { comparedBullets: 1, totalBullets: 1 },
      calls: [],
    })

    expect(explain.bullets.every((entry) => entry.compared)).toBe(true)
  })

  it('步骤里的条数与实际一致', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: null,
      scope: { comparedBullets: 1, totalBullets: 3 },
      calls: [],
    })

    expect(explain.pipeline.requirementCount).toBe(version.coverage.length)
    expect(explain.pipeline.totalBullets).toBe(3)
    expect(explain.pipeline.comparedBullets).toBe(1)
    expect(explain.pipeline.keptBullets).toBe(
      version.diff.filter((entry) => entry.change !== 'remove').length,
    )
    expect(explain.pipeline.checked).toBe(version.integrity.checked)
  })

  it('模型调用记录原样带进来', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: null,
      scope: { comparedBullets: 1, totalBullets: 1 },
      calls: [
        {
          stage: 'analyze',
          model: 'test-model',
          promptVersion: 'llm-jd-analysis-v2',
          bulletsSent: 40,
          promptTokens: 8200,
          completionTokens: 1100,
          degraded: false,
          degradeReason: null,
        },
      ],
    })

    expect(explain.model.calls).toHaveLength(1)
    expect(explain.model.calls[0]!.stage).toBe('analyze')
    expect(explain.model.calls[0]!.bulletsSent).toBe(40)
  })

  it('规则写的要点标为规则写的', async () => {
    const version = await makeVersion()

    const explain = buildExplain({
      version,
      coverage: version.coverage,
      selection: null,
      scope: { comparedBullets: 1, totalBullets: 1 },
      calls: [],
    })

    expect(explain.bullets.every((entry) => entry.writtenBy === 'rules')).toBe(true)
  })
})
