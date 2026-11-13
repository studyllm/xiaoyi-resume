import { describe, expect, it } from 'vitest'

import type { Draft, Fact, ResumeVersion } from '../domain/types'
import {
  draftTermsOf,
  extractComponents,
  extractFacts,
  extractTerms,
  makeClaim,
  produceClaims,
  sameContent,
  splitClauses,
  verifyClaim,
  verifyClaims,
} from './ledger'

const DRAFT: Draft = {
  id: 'draft-1',
  userId: 'user-1',
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  profile: { name: '张三', headline: '', contacts: [] },
  sections: [
    {
      id: 'section-1',
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
            { id: 'bullet-1', text: '主导活动平台前端架构升级，引入 Vue 3 与 Vite，页面构建时间从 120s 降到 18s' },
            { id: 'bullet-2', text: '负责公司营销活动页面的前端开发，配合设计团队完成活动上线' },
            { id: 'bullet-3', text: '参与商家后台管理系统开发，使用 React 完成 30+ 业务页面' },
          ],
        },
      ],
    },
  ],
}

function versionWith(texts: string[]): ResumeVersion {
  return {
    id: 'ver-1',
    userId: 'user-1',
    name: '版本',
    profile: DRAFT.profile,
    jdRawText: '',
    jdRoleName: '',
    draftRevision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    body: texts.join('\n'),
    sections: [],
    diff: [],
    uncovered: [],
    coverage: [],
    integrity: {
      checked: 0,
      violations: [],
      generator: 'rules' as const,
      reverted: 0,
      degraded: false,
      observations: [],
    },
    engineVersion: 'test',
  }
}

describe('成分抽取', () => {
  it('度量带着单位', () => {
    const kinds = extractComponents('构建时间从 120s 降到 18s，转化率 30%')
      .filter((c) => c.kind === 'measure')
      .map((c) => c.text)
    expect(kinds).toContain('120s')
    expect(kinds).toContain('18s')
    expect(kinds).toContain('30%')
  })

  it('拉丁词算实体，一个字母的算噪声', () => {
    const entities = extractComponents('熟悉 Vue 3 与 React，用 s 写脚本')
      .filter((c) => c.kind === 'entity')
      .map((c) => c.text)
    expect(entities).toContain('Vue')
    expect(entities).toContain('React')
    expect(entities).not.toContain('s')
  })

  it('评级与动词带强度', () => {
    const rating = extractComponents('精通 Vue').find((c) => c.kind === 'rating')
    expect(rating?.text).toBe('精通')
    expect(rating?.strength).toBe(3)

    const verb = extractComponents('负责活动页开发').find((c) => c.kind === 'verb')
    expect(verb?.text).toBe('负责')
    expect(verb?.strength).toBe(4)
  })

  it('中文实词按虚词切开', () => {
    expect(extractTerms('负责活动页面的前端开发')).toEqual(['负责活动页面', '前端开发'])
  })
})

describe('事实账本', () => {
  it('按句读把要点切成子句', () => {
    const clauses = splitClauses('主导活动平台前端架构升级，引入 Vue 3 与 Vite，页面构建时间从 120s 降到 18s')
    expect(clauses.map((c) => c.text)).toEqual([
      '主导活动平台前端架构升级',
      '引入 Vue 3 与 Vite',
      '页面构建时间从 120s 降到 18s',
    ])
  })

  it('两次抽取的 fact 集合全等', () => {
    const first = extractFacts(DRAFT)
    const second = extractFacts(DRAFT)
    expect(first.map((f) => f.factId)).toEqual(second.map((f) => f.factId))
    expect(first.length).toBeGreaterThan(0)
  })

  it('fact 带上它在要点里的区间与成分', () => {
    const facts = extractFacts(DRAFT)
    const first = facts[0]!
    expect(DRAFT.sections[0]!.items[0]!.bullets[0]!.text.slice(
      first.span.start,
      first.span.end,
    )).toBe(first.text)
    const withVue = facts.find((f) => f.components.some((c) => c.kind === 'entity' && c.text === 'Vue'))!
    expect(withVue.components.some((c) => c.kind === 'entity' && c.text === 'Vue')).toBe(true)
  })
})

describe('声明账本', () => {
  it('规则引擎按输出要点产出一条声明，引用来源要点的全部事实', () => {
    const version = versionWith([])
    version.diff = [
      {
        bulletId: 'bullet-1',
        sectionId: 'section-1',
        sectionKind: 'experience',
        sectionTitle: '工作经历',
        itemId: 'item-1',
        itemLabel: '美团 · 前端工程师',
        change: 'keep',
        placement: 'same',
        fromText: 'x',
        toText: 'x',
        toIndex: 0,
        reason: '',
      },
    ]
    version.sections = [
      {
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
            bullets: [{ id: 'bullet-1', text: DRAFT.sections[0]!.items[0]!.bullets[0]!.text }],
          },
        ],
      },
    ]

    const { claims } = produceClaims(DRAFT, version)
    expect(claims.length).toBe(1)
    expect(claims[0]!.operation).toBe('keep')
    expect(claims[0]!.sourceFactIds.length).toBe(3)
    expect(claims[0]!.text).toBe(DRAFT.sections[0]!.items[0]!.bullets[0]!.text)
  })

  it('被丢掉的要点产出一条空文本的删除类声明', () => {
    const version = versionWith([])
    version.diff = [
      {
        bulletId: 'bullet-1',
        sectionId: 'section-1',
        sectionKind: 'experience',
        sectionTitle: '工作经历',
        itemId: 'item-1',
        itemLabel: '美团 · 前端工程师',
        change: 'remove',
        placement: 'same',
        fromText: 'x',
        toText: null,
        toIndex: null,
        reason: '',
      },
    ]

    const { claims } = produceClaims(DRAFT, version)
    expect(claims.length).toBe(1)
    expect(claims[0]!.operation).toBe('delete')
    expect(claims[0]!.text).toBe('')
    expect(claims[0]!.sourceFactIds.length).toBeGreaterThan(0)
  })
})

describe('判定', () => {
  const facts: Fact[] = extractFacts(DRAFT)
  const draftTerms = facts.flatMap((fact) =>
    fact.components.filter((c) => c.kind === 'term').map((c) => c.text),
  )

  function check(
    text: string,
    sourceFactIds: string[],
    options: { operation?: 'keep' | 'rewrite' | 'merge'; metadata?: string[] } = {},
  ) {
    const claims = [
      {
        claimId: 'c1',
        bulletId: 'b1',
        text,
        span: { start: 0, end: text.length },
        sourceFactIds,
        operation: options.operation ?? ('rewrite' as const),
        confidence: 1,
      },
    ]
    const metadataComponents = (options.metadata ?? []).flatMap((value) =>
      extractComponents(value),
    )
    return verifyClaims(claims, facts, { draftTerms, metadataComponents })[0]!
  }

  it('引用的事实支撑得住就通过', () => {
    const fact = facts.find((f) => f.text.includes('120s'))!
    const verdict = check('页面构建时间从 120s 降到 18s', [fact.factId])
    expect(verdict.trusted).toBe(true)
  })

  it('凭空多出的数字不可信', () => {
    const fact = facts.find((f) => f.text.includes('120s'))!
    const verdict = check('页面构建时间从 120s 降到 8s，覆盖率 99%', [fact.factId])
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues.some((i) => i.kind === 'unsupported-measure')).toBe(true)
  })

  it('凭空多出的名词不可信', () => {
    const fact = facts.find((f) => f.text.includes('Vue'))!
    const verdict = check('引入 Vue 3 与 React', [fact.factId])
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues.some((i) => i.kind === 'unsupported-entity')).toBe(true)
  })

  it('职责被上调不可信，降级可以', () => {
    // 底稿里是「参与」，输出写成「负责」——上调，拦
    const joined = facts.find((f) => f.text.includes('参与商家后台'))!
    const up = check('负责商家后台管理系统开发', [joined.factId])
    expect(up.trusted).toBe(false)
    expect(up.issues.some((i) => i.kind === 'verb-strength-up')).toBe(true)

    // 底稿里是「主导」，输出写成「参与」——弱化，放行
    const led = facts.find((f) => f.text.includes('主导活动平台'))!
    const down = check('参与活动平台前端架构升级', [led.factId])
    expect(down.trusted).toBe(true)
    expect(down.observations.some((o) => o.kind === 'verb-strength-down')).toBe(true)
  })

  it('没有引用却有内容不可信', () => {
    const verdict = check('凭空来的一句话', [])
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues[0]?.kind).toBe('unreferenced')
  })

  it('底稿里没有的词不可信', () => {
    const fact = facts.find((f) => f.text.includes('架构'))!
    const verdict = check('主导容器编排', [fact.factId])
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues.some((i) => i.kind === 'unsupported-term')).toBe(true)
  })

  it('实词比对不分大小写', () => {
    const fact = facts.find((f) => f.text.includes('Vue'))!
    const verdict = check('引入 vue 3 与 Vite', [fact.factId])
    expect(verdict.trusted).toBe(true)
  })

  it('合并类声明先严后松：并集撑得住就放行，但记一条观察', () => {
    const first = facts.find((f) => f.text.includes('主导活动平台'))!
    const second = facts.find((f) => f.text.includes('引入 Vue'))!

    const verdict = check(
      '主导活动平台前端架构升级，引入 Vue 3 与 Vite',
      [first.factId, second.factId],
      { operation: 'merge' },
    )
    expect(verdict.trusted).toBe(true)
    expect(verdict.observations.some((o) => o.kind === 'assembled-from-facts')).toBe(true)
  })

  it('合并类声明里有并集也撑不住的成分就不可信', () => {
    const first = facts.find((f) => f.text.includes('主导活动平台'))!
    const second = facts.find((f) => f.text.includes('引入 Vue'))!

    const verdict = check(
      '主导活动平台前端架构升级，引入 Vue 3 与 Vite，覆盖 30 万用户',
      [first.factId, second.factId],
      { operation: 'merge' },
    )
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues.some((i) => i.kind === 'unsupported-measure')).toBe(true)
  })

  it('保留类声明与引用的事实对不上就不可信', () => {
    const fact = facts.find((f) => f.text.includes('120s'))!
    const verdict = check('页面构建时间从 120s 降到 18s，还上线了灰度', [fact.factId], {
      operation: 'keep',
    })
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues.some((i) => i.kind === 'keep-mismatch')).toBe(true)
  })

  it('职位名里的「负责」不给正文里的「负责」背书', () => {
    const joined = facts.find((f) => f.text.includes('参与商家后台'))!
    const verdict = check('负责商家后台管理系统开发', [joined.factId], {
      metadata: ['前端负责人'],
    })
    expect(verdict.trusted).toBe(false)
    expect(verdict.issues.some((i) => i.kind === 'verb-strength-up')).toBe(true)
  })

  it('实质相等忽略空白与标点', () => {
    expect(sameContent('负责 A。', '负责A')).toBe(true)
    expect(sameContent('负责 A', '负责 B')).toBe(false)
  })
})

describe('实词比对的两边口径', () => {
  it('动词开头的要点不会被误判成底稿里没有这个词', () => {
    // 底稿里是「支持多部门联合演练」，去掉动词后是「多部门联合演练」——
    // 两边都去才对得上。只去一边就会判成「底稿里没有」。
    const draft: Draft = {
      ...DRAFT,
      sections: [
        {
          id: 'section-1',
          kind: 'experience',
          title: '工作经历',
          items: [
            {
              id: 'item-1',
              org: '美团',
              title: '前端工程师',
              start: '2021-03',
              end: '2024-06',
              present: false,
              bullets: [
                {
                  id: 'bullet-1',
                  text: '支持多部门联合演练的分布式协同仿真平台,需同时支撑上千仿真实体的低延迟实时协同',
                },
              ],
            },
          ],
        },
      ],
    }

    const facts = extractFacts(draft)
    const draftTerms = draftTermsOf(draft)
    const rewritten = '支持多部门联合演练的分布式协同仿真平台，同时支撑上千仿真实体的低延迟实时协同'

    const claim = makeClaim({
      claimId: 'claim-1',
      bulletId: 'bullet-1',
      text: rewritten,
      operation: 'rewrite',
      sourceFactIds: facts.map((fact) => fact.factId),
    })
    const verdict = verifyClaim(claim, facts, {
      draftTerms,
      metadataComponents: extractComponents('美团 前端工程师'),
    })

    expect(verdict.issues.filter((issue) => issue.kind === 'unsupported-term')).toEqual([])
    expect(verdict.trusted).toBe(true)
  })

  it('底稿里真没有的词还是查得出来', () => {
    const draftTerms = draftTermsOf(DRAFT)
    const facts = extractFacts(DRAFT)

    const claim = makeClaim({
      claimId: 'claim-2',
      bulletId: 'bullet-1',
      text: '引入了全新的量子计算调度平台',
      operation: 'rewrite',
      sourceFactIds: facts.map((fact) => fact.factId),
    })
    const verdict = verifyClaim(claim, facts, {
      draftTerms,
      metadataComponents: extractComponents('美团 前端工程师'),
    })

    expect(verdict.issues.some((issue) => issue.kind === 'unsupported-term')).toBe(true)
    expect(verdict.trusted).toBe(false)
  })
})
