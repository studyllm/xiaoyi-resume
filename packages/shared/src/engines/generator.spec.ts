import { describe, expect, it } from 'vitest'

import type { Draft, DraftItem, ResumeVersion, SectionKind } from '../domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '../domain/types'
import { createLlmGenerator, rulesGenerator, type ChatCompletion } from './generator'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

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

const JD = `前端工程师

任职要求：
1. 熟悉 Vue 与 Vite
2. 有组件库建设经验
`

const DRAFT = makeDraft({
  experience: [
    {
      id: 'item-1',
      org: '美团',
      title: '前端工程师',
      bullets: [
        '主导活动平台前端架构升级，引入 Vue 3 与 Vite',
        '参与容器镜像构建，配合运维完成 CI/CD 流程接入',
      ],
    },
  ],
})

/** 模型返回一段固定内容。 */
function chatReturning(text: string): ChatCompletion {
  return async () => ({ text, promptTokens: 120, completionTokens: 60 })
}

/** 按 id 找要点。分区顺序会变，按位置找会踩空。 */
function findBullet(version: ResumeVersion, bulletId: string): string {
  for (const section of version.sections) {
    for (const item of section.items) {
      const bullet = item.bullets.find((entry) => entry.id === bulletId)
      if (bullet) return bullet.text
    }
  }
  throw new Error(`找不到要点 ${bulletId}`)
}

/** 要点在版本正文里的序号。模型回引用的是它。 */
function ordinalOf(version: ResumeVersion, bulletId: string): number {
  let ordinal = 0
  for (const section of version.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        ordinal += 1
        if (bullet.id === bulletId) return ordinal
      }
    }
  }
  return -1
}

async function baseline(): Promise<ResumeVersion> {
  const result = await rulesGenerator.generate(DRAFT, JD, CTX)
  return result.version
}

describe('规则生成器', () => {
  it('产出与规则引擎逐字一致', async () => {
    const version = await baseline()
    expect(findBullet(version, 'item-1-b1')).toBe('主导活动平台前端架构升级，引入 Vue 3 与 Vite')
    expect(version.integrity.generator).toBe('rules')
    expect(version.integrity.degraded).toBe(false)
  })
})

describe('模型生成器', () => {
  it('提示词里给的是子句序号，不是 factId', async () => {
    let seen = ''
    const chat: ChatCompletion = async (request) => {
      seen = request.messages.map((message) => message.content).join('\n')
      return { text: '{"bullets":[]}' }
    }
    await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(seen).toContain('子句 1：')
    expect(seen).not.toMatch(/[0-9a-f]{16}/)
  })

  it('提示词里说清子句编号是每条要点自己的', async () => {
    let seen = ''
    const chat: ChatCompletion = async (request) => {
      seen = request.messages.map((message) => message.content).join('\n')
      return { text: '{"bullets":[]}' }
    }
    await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    // 模型把编号当成全局连续的，引用出来在事实账本里查不到，每条改写都会被丢掉
    expect(seen).toContain('本要点的子句 1：')
    expect(seen).toContain('从 1 开始')
  })

  it('模型改写通过校验就采用模型的正文', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          { key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    expect(findBullet(result.version, 'item-1-b1')).toBe(
      '引入 Vue 3 与 Vite，主导活动平台前端架构升级',
    )
    expect(result.version.integrity.generator).toBe('llm')
    expect(result.version.integrity.reverted).toBe(1)
    expect(result.version.body).toContain('引入 Vue 3 与 Vite，主导活动平台前端架构升级')
  })

  it('改动对照跟着模型的正文走', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          { key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    const entry = result.version.diff.find((item) => item.bulletId === 'item-1-b1')!
    expect(entry.toText).toBe('引入 Vue 3 与 Vite，主导活动平台前端架构升级')
    expect(entry.change).toBe('rewrite')
  })

  it('模型编造的数字被换回规则产出', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          {
            key: String(key),
            clauses: [1, 2],
            text: '主导活动平台前端架构升级，引入 Vue 3 与 Vite，覆盖 30 个业务线',
          },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    expect(findBullet(result.version, 'item-1-b1')).toBe(
      '主导活动平台前端架构升级，引入 Vue 3 与 Vite',
    )
    expect(result.version.integrity.violations.some((v) => v.kind === 'unsupported-measure')).toBe(true)
    expect(result.version.integrity.generator).toBe('rules')
    expect(result.version.integrity.degraded).toBe(true)
  })

  it('模型把「参与」写成「负责」被换回', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b2')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          {
            key: String(key),
            clauses: [1, 2],
            text: '负责容器镜像构建，配合运维完成 CI/CD 流程接入',
          },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    expect(findBullet(result.version, 'item-1-b2')).toBe(
      '参与容器镜像构建，配合运维完成 CI/CD 流程接入',
    )
    expect(result.version.integrity.violations.some((v) => v.kind === 'verb-strength-up')).toBe(true)
  })

  it('模型引用了不存在的事实被换回', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [{ key: String(key), clauses: [9], text: '主导活动平台前端架构升级' }],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    expect(findBullet(result.version, 'item-1-b1')).toBe(
      '主导活动平台前端架构升级，引入 Vue 3 与 Vite',
    )
    expect(result.version.integrity.violations.some((v) => v.kind === 'unreferenced')).toBe(true)
  })

  it('用户不要用模型时，全程不碰模型', async () => {
    let called = 0
    const chat: ChatCompletion = async () => {
      called += 1
      return { text: '{"bullets":[]}' }
    }

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(
      DRAFT,
      JD,
      CTX,
      { useLlm: false },
    )
    expect(called).toBe(0)
    expect(result.version.integrity.generator).toBe('rules')
    expect(result.version.integrity.degraded).toBe(false)
    expect(result.trace.error).toBeNull()
  })

  it('用户要用模型时，才调模型', async () => {
    let called = 0
    const chat: ChatCompletion = async () => {
      called += 1
      return { text: '{"bullets":[]}' }
    }

    await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX, {
      useLlm: true,
    })
    expect(called).toBe(1)
  })

  it('模型不可用时整版降级，正文与规则产出一致', async () => {
    const chat: ChatCompletion = async () => {
      throw new Error('模型超时')
    }

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    const rules = await baseline()
    expect(result.version.body).toBe(rules.body)
    expect(result.version.integrity.generator).toBe('rules')
    expect(result.version.integrity.degraded).toBe(true)
    expect(result.trace.error).toBe('模型超时')
    // 原因也要进版本：界面要能说清「为什么没用上模型」
    expect(result.version.integrity.degradeReason).toBe('模型超时')
  })

  it('模型返回无法解析的内容时整版降级', async () => {
    const chat = chatReturning('抱歉，我无法完成这个请求。')

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    expect(result.version.integrity.generator).toBe('rules')
    expect(result.version.integrity.degraded).toBe(true)
    expect(result.trace.error).toBe('模型返回的内容无法解析')
  })

  it('模型版本带着 facts 与 claims，够独立审计', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          { key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    expect(result.version.trace?.facts.length).toBeGreaterThan(0)
    expect(result.version.trace?.claims.length).toBe(1)
    expect(result.version.trace?.claims[0]!.sourceFactIds.length).toBe(2)
    expect(result.trace.model).toBe('test-model')
    expect(result.trace.promptTokens).toBe(120)
    expect(result.trace.completionTokens).toBe(60)
  })
})

describe('模型改写后的正文', () => {
  it('带禁用词的改写不会交付给用户', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          { key: String(key), clauses: [1, 2], text: '负责 Vue 3 与 Vite 的面试与八股题整理' },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    // 事实校验先拦下这条改写（里面的词在简历里没有依据），
    // 版本正文再过一遍禁用词检查——两道防线，用户看不到带禁用词的正文
    expect(result.version.body).not.toContain('八股')
    expect(result.version.body).not.toContain('面试')
  })

  it('改正文里没有禁用词时照常交付', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          { key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(result.version.integrity.generator).toBe('llm')
    expect(result.version.body).toContain('引入 Vue 3 与 Vite，主导活动平台前端架构升级')
  })
})

describe('改动对照标出正文是谁写的', () => {
  it('模型改过的要点标为模型写的', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [
          { key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' },
        ],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)
    const entry = result.version.diff.find((item) => item.bulletId === 'item-1-b1')

    expect(entry?.writtenBy).toBe('model')
  })

  it('规则写的要点标为规则写的', async () => {
    const result = await rulesGenerator.generate(DRAFT, JD, CTX)
    const entry = result.version.diff.find((item) => item.bulletId === 'item-1-b1')

    expect(entry?.writtenBy).toBe('rules')
  })
})

describe('改写提示词只发已覆盖的要求', () => {
  it('简历里没有对应事实的要求不发', async () => {
    let seen = ''
    const chat: ChatCompletion = async (request) => {
      seen = request.messages.map((message) => message.content).join('\n')
      return { text: '{"bullets":[]}' }
    }
    await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    // 「有组件库建设经验」在简历里没有对应事实——不发
    expect(seen).toContain('熟悉 Vue 与 Vite')
    expect(seen).not.toContain('有组件库建设经验')
  })
})

describe('模型给的依据编号指错了地方', () => {
  it('编号指到这次请求里的别处时，按这条要点的全部事实复核并采用', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    // 模型把子句编号当成了全局连续的：这条要点自己没有第 4 条子句，
    // 但第 4 条在这次请求的事实里确实存在
    const chat = chatReturning(
      JSON.stringify({
        bullets: [{ key: String(key), clauses: [4], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' }],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(findBullet(result.version, 'item-1-b1')).toBe('引入 Vue 3 与 Vite，主导活动平台前端架构升级')
    expect(result.version.integrity.violations.some((v) => v.kind === 'unreferenced')).toBe(false)
  })

  it('编号在这次请求的事实里也不存在时，照旧换回', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [{ key: String(key), clauses: [99], text: '主导活动平台前端架构升级' }],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(findBullet(result.version, 'item-1-b1')).toBe(
      '主导活动平台前端架构升级，引入 Vue 3 与 Vite',
    )
    expect(result.version.integrity.violations.some((v) => v.kind === 'unreferenced')).toBe(true)
  })

  it('编号对不上时记一条观察，说明是按整条要点复核的', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [{ key: String(key), clauses: [4], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' }],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(
      result.version.integrity.observations.some((o) => o.kind === 'clause-index-missed'),
    ).toBe(true)
  })
})

describe('模型写的正文跟规则写的排版一致', () => {
  it('去掉句末标点，与规则路径的产出一样', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [{ key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级。' }],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(findBullet(result.version, 'item-1-b1')).not.toMatch(/[。．]$/)
  })

  it('不替模型改动动词', async () => {
    const version = await baseline()
    const key = ordinalOf(version, 'item-1-b1')
    const chat = chatReturning(
      JSON.stringify({
        bullets: [{ key: String(key), clauses: [1, 2], text: '引入 Vue 3 与 Vite，主导活动平台前端架构升级' }],
      }),
    )

    const result = await createLlmGenerator({ chat, model: 'test-model' }).generate(DRAFT, JD, CTX)

    expect(findBullet(result.version, 'item-1-b1')).toContain('主导')
  })
})
