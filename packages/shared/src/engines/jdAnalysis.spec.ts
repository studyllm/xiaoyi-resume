import { describe, expect, it } from 'vitest'

import type { Draft, RequirementCoverage } from '../domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '../domain/types'
import { createLlmJdAnalyzer, rulesJdAnalyzer } from './jdAnalysis'
import { buildJdAnalysisPrompt, parseModelRequirements, toPromptBullets } from './jdAnalysisPrompt'
import type { ChatCompletion } from './generator'
import { recomputeCoverageAfterRemoval } from './versionAssembly'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

const JD = `前端工程师

任职要求：
1. 精通 Vue 与 TypeScript
2. 熟悉 Docker 与 CI/CD 流程
`

/** 一份有两个要点的简历。 */
function makeDraft(): Draft {
  return {
    id: 'draft-1',
    userId: 'user-1',
    revision: 1,
    profile: { name: '张三', headline: '前端工程师', contacts: [{ label: '手机', value: '13800000000' }] },
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: SECTION_ORDER.map((kind) => ({
      id: `sec-${kind}`,
      kind,
      title: SECTION_TITLES[kind],
      items:
        kind === 'experience'
          ? [
              {
                id: 'item-1',
                org: '美团',
                title: '前端工程师',
                start: null,
                end: null,
                present: true,
                bullets: [
                  { id: 'bullet-1', text: '主导活动平台前端架构升级，引入 Vue 3，覆盖 30 个业务线' },
                  { id: 'bullet-2', text: '负责容器镜像构建与 CI/CD 流程接入' },
                ],
              },
            ]
          : [],
    })),
  }
}

/** 模型返回一段固定内容。 */
function chatReturning(text: string): ChatCompletion {
  return async () => ({ text, promptTokens: 120, completionTokens: 60 })
}

/** 记下发给模型的提示词。 */
function chatSpy(text: string, seen: string[]): ChatCompletion {
  return async (request) => {
    seen.push(request.messages.map((message) => message.content).join('\n'))
    return { text, promptTokens: 120, completionTokens: 60 }
  }
}

/** 三个要点的简历：中间那条与这个岗位无关。 */
function makeDraftWithIrrelevantBullet(): Draft {
  const draft = makeDraft()
  const bullets = draft.sections[1]!.items[0]!.bullets
  bullets.splice(1, 0, { id: 'bullet-mid', text: '负责周会组织与团队文档整理' })
  return draft
}

function modelRequirements(entries: unknown[]): string {
  return JSON.stringify({ requirements: entries })
}

describe('规则目录匹配', () => {
  it('抽出的要求与命中情况跟今天的一致', async () => {
    const result = await rulesJdAnalyzer.analyze(makeDraft(), JD, CTX)

    expect(result.engine).toBe('rules')
    expect(result.degraded).toBe(false)
    expect(result.coverage.length).toBeGreaterThan(0)
    // 每条要求都能在 JD 原文里找到
    for (const entry of result.coverage) {
      expect(JD.replace(/\s/g, '')).toContain(entry.text.replace(/\s/g, ''))
    }
  })
})

describe('提示词', () => {
  it('给的是要点序号，不是要点 id', () => {
    const bullets = toPromptBullets(makeDraft())
    expect(bullets[0]!.ordinal).toBe(1)
    expect(bullets[0]!.text).toContain('Vue 3')

    const prompt = buildJdAnalysisPrompt({ jdText: JD, bullets })
    expect(prompt.user).toContain('要点 1')
    expect(prompt.user).not.toContain('bullet-1')
  })

  it('提示词里没有姓名与联系方式', () => {
    const prompt = buildJdAnalysisPrompt({ jdText: JD, bullets: toPromptBullets(makeDraft()) })

    expect(prompt.user).not.toContain('张三')
    expect(prompt.user).not.toContain('13800000000')
    expect(prompt.user).not.toContain('前端工程师 |')
  })

  it('JD 全文给进去了', () => {
    const prompt = buildJdAnalysisPrompt({ jdText: JD, bullets: toPromptBullets(makeDraft()) })
    expect(prompt.user).toContain('熟悉 Docker 与 CI/CD 流程')
  })
})

describe('解析模型的输出', () => {
  it('抽出要求与引用的序号', () => {
    const parsed = parseModelRequirements(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1, 3] }]),
    )

    expect(parsed).toEqual([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1, 3] }])
  })

  it('坏 JSON 返回 null', () => {
    expect(parseModelRequirements('抱歉，我无法完成这个请求。')).toBeNull()
    expect(parseModelRequirements('{"requirements": "不是数组"}')).toBeNull()
  })

  it('不合法的条目被丢掉，其余留下', () => {
    const parsed = parseModelRequirements(
      modelRequirements([
        { quote: '', tier: 'strong', bullets: [1] },
        { quote: '好的', tier: '不确定', bullets: [1] },
        { quote: '精通 Vue 与 TypeScript', tier: 'weak', bullets: [1] },
      ]),
    )

    expect(parsed).toHaveLength(1)
    expect(parsed![0]!.quote).toBe('精通 Vue 与 TypeScript')
  })
})

describe('比对时只把候选要点发给模型', () => {
  it('与岗位无关的要点不进提示词', async () => {
    const seen: string[] = []
    const chat = chatSpy(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] }]),
      seen,
    )

    await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraftWithIrrelevantBullet(),
      JD,
      CTX,
    )

    expect(seen[0]).toContain('要点 1')
    expect(seen[0]).not.toContain('周会组织')
  })

  it('JD 全文照发', async () => {
    const seen: string[] = []
    const chat = chatSpy(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] }]),
      seen,
    )

    await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraftWithIrrelevantBullet(),
      JD,
      CTX,
    )

    expect(seen[0]).toContain('熟悉 Docker 与 CI/CD 流程')
  })

  it('候选要点保留在整份简历里的原序号', async () => {
    const seen: string[] = []
    const chat = chatSpy(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] }]),
      seen,
    )

    await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraftWithIrrelevantBullet(),
      JD,
      CTX,
    )

    // 第 2 条没参与比对，因此编号从 1 跳到 3——跳号而不是重编
    expect(seen[0]).toContain('要点 1')
    expect(seen[0]).toContain('要点 3')
    expect(seen[0]).not.toContain('要点 2')
    expect(seen[0]).toContain('被略过的是与这个岗位无关的要点')
  })

  it('模型引用了没发给它的序号时那条引用被丢掉', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [2] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraftWithIrrelevantBullet(),
      JD,
      CTX,
    )

    expect(result.warnings.join(' ')).toContain('不存在的简历要点')
    // 引用没被采用——命中要点里没有第 2 条
    expect(result.coverage[0]!.matchedBulletIds).not.toContain('bullet-mid')
  })

  it('这次比对了多少条要点随结果一起给出', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraftWithIrrelevantBullet(),
      JD,
      CTX,
    )

    expect(result.bulletsTotal).toBe(3)
    expect(result.bulletsCompared).toBe(2)
  })
})

describe('模型比对的结论要逐条核对', () => {
  it('要求不在 JD 原文中的被丢掉，并记一条提示', async () => {
    const chat = chatReturning(
      modelRequirements([
        { quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] },
        { quote: '精通 Go 与 Kubernetes', tier: 'strong', bullets: [1] },
      ]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    expect(result.coverage).toHaveLength(1)
    expect(result.coverage[0]!.text).toBe('精通 Vue 与 TypeScript')
    expect(result.warnings.join(' ')).toContain('1 条')
  })

  it('指向不存在的序号时丢掉这条引用', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [99] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    // 引用被丢掉：模型说的那个序号压根没发给它
    expect(result.warnings.join(' ')).toContain('不存在的简历要点')
    // 但简历里确实有对应事实——复核后按弱覆盖处理，不说「没有对应事实」
    expect(result.coverage[0]!.tier).toBe('weak')
    expect(result.coverage[0]!.approximate).toBe(true)
    expect(result.coverage[0]!.matchedBulletIds).toEqual(['bullet-1'])
  })

  it('说「强覆盖」但要点没有结果信号时降为弱覆盖', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '熟悉 Docker 与 CI/CD 流程', tier: 'strong', bullets: [2] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    // 第 2 条要点没有数字，规则路径也会判弱覆盖
    expect(result.coverage[0]!.tier).toBe('weak')
  })

  it('有结果信号时说「强覆盖」就采信', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    expect(result.coverage[0]!.tier).toBe('strong')
    expect(result.coverage[0]!.matchedBulletIds).toEqual(['bullet-1'])
  })

  it('模型说没命中，但在全部要点上复核到事实时按弱覆盖处理', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'none', bullets: [1] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    // 模型只看到了候选要点，判「未覆盖」；简历里其实有 Vue 3 这条事实，
    // 复核后不能对用户说「没有对应事实」
    expect(result.coverage[0]!.tier).toBe('weak')
    expect(result.coverage[0]!.approximate).toBe(true)
    expect(result.coverage[0]!.matchedBulletIds).toEqual(['bullet-1'])
  })

  it('复核后仍匹配不到的要求才算未覆盖', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '熟悉 Docker 与 CI/CD 流程', tier: 'none', bullets: [] }]),
    )
    // 这份简历里没有 Docker 与 CI/CD 的事实——复核也匹配不到
    const draft = makeDraft()
    draft.sections[1]!.items[0]!.bullets.splice(1)

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      draft,
      JD,
      CTX,
    )

    expect(result.coverage[0]!.tier).toBe('none')
    expect(result.coverage[0]!.approximate).toBe(false)
    expect(result.coverage[0]!.matchedBulletIds).toEqual([])
  })

  it('命中的要点全是规划性表述时判未覆盖', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] }]),
    )
    const draft = makeDraft()
    draft.sections[1]!.items[0]!.bullets[0]!.text = '计划在后续版本里引入 Vue 3，覆盖 30 个业务线'

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(draft, JD, CTX)

    expect(result.coverage[0]!.tier).toBe('none')
    expect(result.coverage[0]!.reason).toBe('planned-only')
  })

  it('含禁用词的要求被丢掉', async () => {
    const chat = chatReturning(
      modelRequirements([
        { quote: '精通 Vue 与 TypeScript', tier: 'strong', bullets: [1] },
        { quote: '有面试其他开发者的经验', tier: 'weak', bullets: [1] },
      ]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    expect(result.coverage).toHaveLength(1)
    expect(result.coverage[0]!.text).not.toContain('面试')
  })

  it('一条都核对不上时回落规则目录', async () => {
    const chat = chatReturning(
      modelRequirements([{ quote: '精通 Go 与 Kubernetes', tier: 'strong', bullets: [1] }]),
    )

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    expect(result.engine).toBe('rules')
    expect(result.degraded).toBe(true)
    expect(result.degradeReason).toContain('核对上')
  })
})

describe('模型不可用时回落规则目录', () => {
  it('调用抛错时回落，并说清原因', async () => {
    const chat: ChatCompletion = async () => {
      throw new Error('模型超时')
    }

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    expect(result.engine).toBe('rules')
    expect(result.degraded).toBe(true)
    expect(result.degradeReason).toBe('模型超时')
    // 规则目录那份还是能给出结果的
    expect(result.coverage.length).toBeGreaterThan(0)
  })

  it('返回坏 JSON 时回落', async () => {
    const chat = chatReturning('抱歉，我无法完成这个请求。')

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
    )

    expect(result.engine).toBe('rules')
    expect(result.degraded).toBe(true)
    expect(result.degradeReason).toBe('模型返回的内容无法解析')
  })

  it('用户不要用模型时完全不碰模型', async () => {
    let called = 0
    const chat: ChatCompletion = async () => {
      called += 1
      return { text: modelRequirements([]) }
    }

    const result = await createLlmJdAnalyzer({ chat, model: 'test-model' }).analyze(
      makeDraft(),
      JD,
      CTX,
      { useLlm: false },
    )

    expect(called).toBe(0)
    expect(result.engine).toBe('rules')
    expect(result.degraded).toBe(false)
  })
})

describe('删减之后重算覆盖', () => {
  const coverage: RequirementCoverage[] = [
    {
      requirementId: 'req-1',
      text: '精通 Vue 与 TypeScript',
      keywords: ['Vue'],
      tier: 'strong',
      approximate: false,
      reason: null,
      matchedBulletIds: ['bullet-1', 'bullet-2'],
    },
  ]

  it('唯一的命中被删掉时降为未覆盖', () => {
    const result = recomputeCoverageAfterRemoval(
      [{ ...coverage[0]!, matchedBulletIds: ['bullet-1'] }],
      new Map([['bullet-1', '主导活动平台前端架构升级，覆盖 30 个业务线']]),
      new Set(['bullet-1']),
    )

    expect(result[0]!.tier).toBe('none')
    expect(result[0]!.matchedBulletIds).toEqual([])
  })

  it('删掉的不是命中要点时不动', () => {
    const result = recomputeCoverageAfterRemoval(
      coverage,
      new Map([
        ['bullet-1', '主导活动平台前端架构升级，覆盖 30 个业务线'],
        ['bullet-2', '参与前端架构升级'],
      ]),
      new Set(['bullet-3']),
    )

    expect(result[0]!.tier).toBe('strong')
    expect(result[0]!.matchedBulletIds).toEqual(['bullet-1', 'bullet-2'])
  })

  it('带结果信号的那条被删掉后降为弱覆盖', () => {
    const result = recomputeCoverageAfterRemoval(
      coverage,
      new Map([
        ['bullet-1', '主导活动平台前端架构升级，覆盖 30 个业务线'],
        ['bullet-2', '参与前端架构升级'],
      ]),
      new Set(['bullet-1']),
    )

    // 幸存的要点没有结果信号，撑不起「强覆盖」
    expect(result[0]!.tier).toBe('weak')
    expect(result[0]!.matchedBulletIds).toEqual(['bullet-2'])
  })
})
