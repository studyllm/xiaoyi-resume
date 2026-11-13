/**
 * 模型改写用的提示词与响应解析。
 *
 * **引用用子句序号**：模型看到的是「子句 1、子句 2」，回引也用序号。
 * 让模型抄 factId（16 位哈希）抄错一位就查不出依据——查不出依据等于没引用。
 */
import type { Fact, RequirementCoverage } from '../domain/types'

/** 提示词版本。变了就换号——生成日志靠它区分两批输出。 */
export const PROMPT_VERSION = 'llm-rewrite-v2'

export interface PromptBullet {
  /** 要点的序号，从 1 开始。模型回引时用这个号。 */
  key: string
  clauses: { index: number; text: string }[]
  /** 规则产出的那一句，作为改写的起点。 */
  baseline: string
}

export interface RewritePrompt {
  system: string
  user: string
}

const SYSTEM = `你是一位简历改写助手。你只能改写给定的要点，不得新增事实。

规则：
1. 只重组给定的子句，不得出现子句里没有的数字、公司、项目、技术名词。
2. 数字、百分比、单位、专有名词必须与原文一字不差。
3. 不得提高职责强度：「参与」「协助」「配合」不能改成「负责」「主导」「牵头」。
4. 不得提高技能评级：「了解」「熟悉」不能改成「掌握」「精通」。
5. 尽量用原文的词。改写幅度越小越好。
6. 每条要点至多输出一次。**clauses 填的是这条要点自己的子句编号，从 1 开始**——要点 5 的子句 1 指要点 5 的第一个子句，不要把编号跨要点累加。

只输出 JSON，不要任何解释：
{"bullets":[{"key":"1","clauses":[1],"text":"改写后的正文"}]}`

/**
 * 拼提示词。
 *
 * **只发已覆盖的要求**——简历里没有对应事实的要求，发给模型只会诱导它去
 * 「照顾」一条根本没有事实可写的要求。
 */
export function buildRewritePrompt(input: {
  role: string
  requirements: RequirementCoverage[]
  bullets: PromptBullet[]
}): RewritePrompt {
  const lines: string[] = [`岗位：${input.role || '未命名岗位'}`, '']

  const covered = input.requirements.filter((entry) => entry.tier !== 'none')
  if (covered.length > 0) {
    lines.push('这一版要覆盖的要求：')
    covered.forEach((requirement, index) => {
      lines.push(`${index + 1}. ${requirement.text}`)
    })
    lines.push('')
  }

  lines.push('要点：')
  for (const bullet of input.bullets) {
    lines.push(`要点 ${bullet.key}`)
    for (const clause of bullet.clauses) {
      // **「本要点的」三个字不能省**——模型会把子句编号当成全局连续的，
      // 于是引用出来的编号在事实账本里查不到，每条改写都被当成「没指出依据」。
      lines.push(`本要点的子句 ${clause.index}：${clause.text}`)
    }
    lines.push(`现成的一句：${bullet.baseline}`)
    lines.push('')
  }

  return { system: SYSTEM, user: lines.join('\n').trim() }
}

/** 要点与它的子句。给模型看的形状。 */
export function toPromptBullet(key: string, facts: Fact[], baseline: string): PromptBullet {
  return {
    key,
    clauses: facts.map((fact, index) => ({ index: index + 1, text: fact.text })),
    baseline,
  }
}

export interface ModelRewrite {
  /** 要点序号。 */
  key: string
  /** 用到的子句序号，从 1 开始。 */
  clauses: number[]
  text: string
}

/**
 * 解析模型的输出。
 *
 * 返回 null 表示**整个输出没法用**——调用方按整版降级处理。
 * 单条不合法只是那一条被丢掉（那条要点用规则产出），不影响其它条。
 */
export function parseRewrites(raw: string): ModelRewrite[] | null {
  const payload = extractJson(raw)
  if (!payload) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const bullets = (parsed as { bullets?: unknown }).bullets
  if (!Array.isArray(bullets)) return null

  const rewrites: ModelRewrite[] = []
  for (const entry of bullets) {
    if (!entry || typeof entry !== 'object') continue
    const { key, clauses, text } = entry as { key?: unknown; clauses?: unknown; text?: unknown }
    if (typeof key !== 'string' || !key.trim()) continue
    if (typeof text !== 'string' || !text.trim()) continue
    if (!Array.isArray(clauses)) continue
    const indices = clauses.filter((value): value is number => typeof value === 'number' && value >= 1)
    rewrites.push({ key: key.trim(), clauses: indices, text: text.trim() })
  }

  return rewrites
}

/** 从可能带围栏与解释文字的回复里挖出 JSON 对象。 */
function extractJson(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const candidate = fenced ? fenced[1]! : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return candidate.slice(start, end + 1)
}
