/**
 * JD 比对用的提示词与响应解析。
 *
 * **模型只被允许做两件事**：从 JD 里逐字摘出岗位要求，以及指向底稿里的要点。
 * 两件事都留了核对的口子——摘出来的句子必须能在 JD 原文里找到，指向的要点
 * 必须是我们给过的序号。
 *
 * **引用用序号**：模型看到的是「要点 1、要点 2」，回引也用序号。让模型抄
 * 要点 id 那种长串，抄错一位就查不出依据——而查不出依据等于没引用。
 */
import type { Draft } from '../domain/types'
import { SECTION_TITLES } from '../domain/types'

/** 提示词版本。变了就换号——分析记录靠它区分两批输出。 */
export const PROMPT_VERSION = 'llm-jd-analysis-v1'

/**
 * 给模型看的简历要点。
 *
 * **序号是唯一的引用方式**——模型看不到 bullet id。
 */
export interface PromptBullet {
  /** 序号，从 1 开始。模型回引时用这个号。 */
  ordinal: number
  sectionKind: string
  itemLabel: string
  text: string
}

export interface JdAnalysisPrompt {
  system: string
  user: string
}

const SYSTEM = `你是一位岗位要求分析助手。给定一份岗位描述和一份候选人简历，你要找出岗位描述里的岗位要求，并逐条判断简历是否覆盖了它。

规则：
1. **要求必须逐字摘自岗位描述**。quote 字段照抄原句，不要改写、不要合并、不要补充。
2. **只抽岗位要求**，不要抽岗位职责、公司介绍、福利待遇、薪资这些。
3. 每条要求给 tier：
   - strong：简历里有直接对应的事实
   - weak：简历里有相关经历，但没有直接对应这条要求
   - none：简历里没有对应的事实
4. tier 是 strong 或 weak 时，bullets 填命中的简历要点序号（从 1 开始）。tier 是 none 时 bullets 必须是空数组。
5. **只能引用给定的序号**，不要编造。
6. 不得写出简历里没有的内容。

只输出 JSON，不要任何解释：
{"requirements":[{"quote":"岗位描述里的原句","tier":"strong","bullets":[1,2]}]}`

/** 把简历摊平成给模型看的编号列表。 */
export function toPromptBullets(draft: Draft): PromptBullet[] {
  const bullets: PromptBullet[] = []
  let ordinal = 0

  for (const section of draft.sections) {
    for (const item of section.items) {
      const label = [item.org, item.title].filter(Boolean).join(' · ')
      for (const bullet of item.bullets) {
        ordinal += 1
        bullets.push({
          ordinal,
          sectionKind: SECTION_TITLES[section.kind] ?? section.kind,
          itemLabel: label,
          text: bullet.text,
        })
      }
    }
  }

  return bullets
}

/**
 * 拼提示词。
 *
 * **简历只发分区、条目与要点正文**——`draft.profile`（姓名、抬头、联系方式）
 * 整个不进提示词（`docs/privacy-conclusions.md` §4.3）。
 */
export function buildJdAnalysisPrompt(input: { jdText: string; bullets: PromptBullet[] }): JdAnalysisPrompt {
  const lines: string[] = ['岗位描述：', input.jdText.trim(), '', '简历要点：']

  if (input.bullets.length === 0) {
    lines.push('（这份简历里没有要点）')
  } else {
    for (const bullet of input.bullets) {
      const label = bullet.itemLabel ? ` | ${bullet.itemLabel}` : ''
      lines.push(`要点 ${bullet.ordinal}${label}：${bullet.text}`)
    }
  }

  lines.push('', '请抽出岗位描述里的岗位要求，并逐条判断这份简历是否覆盖。')

  return { system: SYSTEM, user: lines.join('\n') }
}

/** 模型给的一条要求。还没核对过。 */
export interface ModelRequirement {
  /** 逐字引用的 JD 原句。 */
  quote: string
  tier: 'strong' | 'weak' | 'none'
  /** 命中的要点序号。 */
  bullets: number[]
}

/**
 * 解析模型的输出。
 *
 * 返回 null 表示**整个输出没法用**——调用方按整份回落处理。
 * 单条不合法只是那一条被丢掉（那条要求按没有对应事实处理）。
 */
export function parseModelRequirements(raw: string): ModelRequirement[] | null {
  const payload = extractJson(raw)
  if (!payload) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const requirements = (parsed as { requirements?: unknown }).requirements
  if (!Array.isArray(requirements)) return null

  const result: ModelRequirement[] = []
  for (const entry of requirements) {
    if (!entry || typeof entry !== 'object') continue
    const { quote, tier, bullets } = entry as {
      quote?: unknown
      tier?: unknown
      bullets?: unknown
    }
    if (typeof quote !== 'string' || !quote.trim()) continue
    if (tier !== 'strong' && tier !== 'weak' && tier !== 'none') continue

    const ordinals: number[] = []
    if (Array.isArray(bullets)) {
      for (const value of bullets) {
        if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
          ordinals.push(value)
        }
      }
    }

    result.push({ quote: quote.trim(), tier, bullets: ordinals })
  }

  return result
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
