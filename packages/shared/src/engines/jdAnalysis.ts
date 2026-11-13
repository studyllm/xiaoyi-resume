/**
 * JD 比对：把一份 JD 与一份底稿对照起来。
 *
 * **规则引擎与模型是同一个接口的两个实现**（ADR-0005 §2）——视图与状态层
 * 不感知实现差异，回退、降级都在这个接口后面。
 *
 * **模型的输出不被信任**（ADR-0003 的口径）：它给的每一条要求与命中结论，
 * 落地前都要核对来源。核对不通过的丢掉或降级，不采信。
 */
import { createIdSeed, type IdSeed } from '../domain/ids'
import type { Draft, Jd, JdRequirement, RequirementCoverage } from '../domain/types'
import { DEFAULT_MAX_CANDIDATES, selectCandidates } from './candidateSelection'
import { collectEvidence, isPlanned, matchRequirement } from './coverage'
import { findForbiddenWords } from './forbidden'
import type { ChatCompletion, ChatCompletionResponse } from './generator'
import { evaluateJd } from './generateVersion'
import { catalogKeywordsOf, detectRoleName, parseJd } from './jd'
import {
  PROMPT_VERSION,
  buildJdAnalysisPrompt,
  parseModelRequirements,
  toPromptBullets,
  type ModelRequirement,
} from './jdAnalysisPrompt'
import { hasResultSignal } from './signals'
import { normalizeText } from './textUtils'
import type { BulletEvidence, EngineContext, JdAnalysis, JdAnalysisResult, JdAnalyzer, StoredJdAnalysisPayload, StoredEvidence } from './types'

/**
 * 一份分析结果 → 落库的形状。
 *
 * **`Set` 与 `Map` 存不进 jsonb**——摊平成数组，取出来再装回去。
 */
export function toStoredAnalysis(analysis: JdAnalysis): StoredJdAnalysisPayload {
  return {
    jd: analysis.jd,
    coverage: analysis.coverage,
    evidence: analysis.evidence.map(toStoredEvidence),
    warnings: analysis.warnings,
    engine: analysis.engine,
    degraded: analysis.degraded,
    degradeReason: analysis.degradeReason ?? null,
    call: analysis.call ?? null,
    selection: analysis.selection ?? null,
    bulletsCompared: analysis.bulletsCompared,
    bulletsTotal: analysis.bulletsTotal,
  }
}

/** 落库的形状 → 一份分析结果。 */
export function fromStoredAnalysis(payload: StoredJdAnalysisPayload): JdAnalysis {
  return {
    jd: payload.jd,
    coverage: payload.coverage,
    evidence: payload.evidence.map(fromStoredEvidence),
    warnings: payload.warnings,
    engine: payload.engine,
    degraded: payload.degraded,
    degradeReason: payload.degradeReason,
    call: payload.call ?? null,
    selection: payload.selection ?? null,
    bulletsCompared: payload.bulletsCompared,
    bulletsTotal: payload.bulletsTotal,
  }
}

function toStoredEvidence(entry: BulletEvidence): StoredEvidence {
  const relatedByEntry: Record<string, string[]> = {}
  for (const [itemId, terms] of entry.relatedByEntry) {
    relatedByEntry[itemId] = [...terms]
  }
  return {
    bulletId: entry.bulletId,
    text: entry.text,
    sectionId: entry.sectionId,
    sectionKind: entry.sectionKind,
    itemId: entry.itemId,
    draftIndex: entry.draftIndex,
    relevance: entry.relevance,
    hasResult: entry.hasResult,
    planned: entry.planned,
    exactTerms: [...entry.exactTerms],
    relatedByEntry,
    approxRequirements: [...entry.approxRequirements],
    jdRelated: entry.jdRelated,
  }
}

function fromStoredEvidence(entry: StoredEvidence): BulletEvidence {
  return {
    bulletId: entry.bulletId,
    text: entry.text,
    sectionId: entry.sectionId,
    sectionKind: entry.sectionKind,
    itemId: entry.itemId,
    draftIndex: entry.draftIndex,
    relevance: entry.relevance,
    hasResult: entry.hasResult,
    planned: entry.planned,
    exactTerms: new Set(entry.exactTerms),
    relatedByEntry: new Map(
      Object.entries(entry.relatedByEntry).map(([itemId, terms]) => [itemId, new Set(terms)]),
    ),
    approxRequirements: new Set(entry.approxRequirements),
    jdRelated: entry.jdRelated,
  }
}


/**
 * 规则目录匹配的实现。
 *
 * **就是今天浏览器里跑的那套**——`parseJd` 抽要求、`evaluateJd` 判命中。
 * 没配供应商、模型调不通、用户不要用模型时都走这里，产物逐字不变。
 */
export const rulesJdAnalyzer: JdAnalyzer = {
  async analyze(draft, jdText, ctx) {
    const seed = createIdSeed()
    const { jd, warnings } = parseJd(jdText, ctx, seed)
    const coverage = evaluateJd(draft, jd, ctx)
    const evidence = collectEvidence(draft, jd)
    const totalBullets = evidence.length

    return {
      jd,
      coverage,
      evidence,
      warnings,
      engine: 'rules',
      degraded: false,
      degradeReason: null,
      model: null,
      promptVersion: null,
      promptTokens: 0,
      completionTokens: 0,
      // 规则路径看的是全部要点
      bulletsCompared: totalBullets,
      bulletsTotal: totalBullets,
    }
  },
}

export interface LlmJdAnalyzerDeps {
  chat: ChatCompletion
  model: string
  /** 单次调用的输出 token 上限。成本护栏的第一道闸。 */
  maxTokens?: number
  temperature?: number
  /** 最多发多少条要点给模型。裁剪只影响模型能看到什么。 */
  maxCandidateBullets?: number
}

/**
 * 模型比对的实现。
 *
 * **模型只被允许做两件事**：从 JD 里逐字摘出岗位要求，以及指向底稿里的要点。
 * 两件事都留了核对的口子（见 `verifyModelRequirement`）。
 */
export function createLlmJdAnalyzer(deps: LlmJdAnalyzerDeps): JdAnalyzer {
  const { chat, model } = deps
  const maxTokens = deps.maxTokens ?? 4000
  const temperature = deps.temperature ?? 0
  const maxCandidateBullets = deps.maxCandidateBullets ?? DEFAULT_MAX_CANDIDATES

  return {
    async analyze(draft, jdText, ctx, options = {}) {
      // 用户不要用模型：全程不碰模型，简历不发给任何第三方。
      // 这条与 `createLlmGenerator` 的口径一致（`llm-engine` 规格：
      // 「默认不发」）。
      if (options.useLlm === false) {
        return rulesJdAnalyzer.analyze(draft, jdText, ctx)
      }

      const seed = createIdSeed()

      // 规则先在**全部**要点上算一遍相关度——模型只看挑出来的那一份，
      // 但系统的判定始终基于全部要点。
      const { jd: rulesJd } = parseJd(jdText, ctx, seed)
      const allEvidence = collectEvidence(draft, rulesJd)
      const selection = selectCandidates(allEvidence, { maxCandidates: maxCandidateBullets })
      const candidateIds = new Set(selection.candidates.map((entry) => entry.bulletId))
      const bullets = toPromptBullets(draft, { includeBulletIds: candidateIds })
      const prompt = buildJdAnalysisPrompt({ jdText, bullets })

      let raw: string
      let promptTokens = 0
      let completionTokens = 0
      try {
        const response: ChatCompletionResponse = await chat({
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature,
          maxTokens,
        })
        raw = response.text
        promptTokens = response.promptTokens ?? 0
        completionTokens = response.completionTokens ?? 0
      } catch (error) {
        return rulesOutcome(draft, jdText, ctx, messageOf(error), {
          model,
          bulletsSent: bullets.length,
          promptTokens: 0,
          completionTokens: 0,
        })
      }

      const parsed = parseModelRequirements(raw)
      if (!parsed) {
        return rulesOutcome(draft, jdText, ctx, '模型返回的内容无法解析', {
          model,
          bulletsSent: bullets.length,
          promptTokens,
          completionTokens,
        })
      }

      const verified = verifyModelRequirements(parsed, {
        jdText,
        bullets,
        draft,
        seed,
      })

      // 一条都没核对上 → 这次比对没有结果，用规则目录重来
      if (verified.coverage.length === 0) {
        return rulesOutcome(draft, jdText, ctx, '模型给出的要求都没能在 JD 原文中核对上', {
          model,
          bulletsSent: bullets.length,
          promptTokens,
          completionTokens,
        })
      }

      // 模型只看到了候选要点。它判「未覆盖」的要求，要在**全部**要点上
      // 用规则目录复核一次——否则未覆盖清单会因为裁剪而出现假阴性。
      const coverage = recheckUncovered(draft, verified)

      return {
        jd: verified.jd,
        coverage,
        evidence: verified.evidence,
        warnings: verified.warnings,
        engine: 'llm',
        degraded: false,
        degradeReason: null,
        model,
        promptVersion: PROMPT_VERSION,
        promptTokens,
        completionTokens,
        bulletsCompared: bullets.length,
        bulletsTotal: selection.totalBullets,
        selection: {
          comparedBulletIds: selection.candidates.map((entry) => entry.bulletId),
          dropped: selection.dropped,
        },
        call: {
          model,
          promptVersion: PROMPT_VERSION,
          bulletsSent: bullets.length,
          promptTokens,
          completionTokens,
          degraded: false,
          degradeReason: null,
        },
      }
    },
  }
}

/**
 * 模型判「未覆盖」的要求，在全部要点上用规则目录复核一次。
 *
 * **裁剪只影响模型能看到什么，不影响系统能判定什么**——规则也匹配不到才算
 * 真的未覆盖；规则匹配到的降为弱覆盖，并标注为按关键词近似匹配。
 *
 * **证据按模型给的要求重算**——`approxRequirements` 是按要求 id 记的，
 * 拿规则目录那批要求的 id 去查模型的要求，对不上。
 */
function recheckUncovered(
  draft: Draft,
  verified: VerifiedRequirements,
): RequirementCoverage[] {
  const allEvidence = collectEvidence(draft, verified.jd)
  const requirementById = new Map(verified.jd.requirements.map((r) => [r.id, r]))

  return verified.coverage.map((entry) => {
    if (entry.tier !== 'none') return entry
    const requirement = requirementById.get(entry.requirementId)
    if (!requirement) return entry

    const rule = matchRequirement(draft, requirement, allEvidence)
    if (rule.tier === 'none') return entry

    return {
      ...entry,
      tier: 'weak',
      approximate: true,
      reason: null,
      matchedBulletIds: rule.matchedBulletIds,
    }
  })
}

/** 模型整体不可用：整份用规则目录匹配，并说清原因。 */
async function rulesOutcome(
  draft: Draft,
  jdText: string,
  ctx: EngineContext,
  reason: string,
  call: { model: string; bulletsSent: number; promptTokens: number; completionTokens: number },
): Promise<JdAnalysisResult> {
  const result = await rulesJdAnalyzer.analyze(draft, jdText, ctx)
  return {
    ...result,
    degraded: true,
    degradeReason: reason,
    call: {
      model: call.model,
      promptVersion: PROMPT_VERSION,
      bulletsSent: call.bulletsSent,
      promptTokens: call.promptTokens,
      completionTokens: call.completionTokens,
      degraded: true,
      degradeReason: reason,
    },
  }
}

interface VerifyInput {
  jdText: string
  bullets: ReturnType<typeof toPromptBullets>
  draft: Draft
  seed: IdSeed
}

interface VerifiedRequirements {
  jd: Jd
  coverage: RequirementCoverage[]
  evidence: BulletEvidence[]
  warnings: string[]
}

/**
 * 逐条核对模型给的结论。
 *
 * **模型说的每一样东西都要能指回源头**：要求指回 JD 原文，命中指回底稿里的
 * 真实要点，强度指回结果信号。
 */
function verifyModelRequirements(
  parsed: ModelRequirement[],
  input: VerifyInput,
): VerifiedRequirements {
  const { jdText, bullets, draft, seed } = input
  const warnings: string[] = []
  const normalizedJd = normalizeText(jdText)

  // **按序号查，不是按数组下标**——候选要点保留了整份简历里的原序号，
  // 数组下标与序号对不上。模型引用了没发给它的序号，在这里就查不到，
  // 按越界丢掉那条要求，不会错挂到别的要点上。
  const bulletsByOrdinal = new Map(bullets.map((bullet) => [bullet.ordinal, bullet]))

  const requirements: JdRequirement[] = []
  const coverage: RequirementCoverage[] = []
  /** 要点 id → 命中它的要求条数。相关度按这个算。 */
  const hitsPerBullet = new Map<string, number>()

  let unverified = 0
  let outOfRange = 0

  for (const entry of parsed) {
    // 1. 要求必须逐字来自 JD 原文
    if (!normalizedJd.includes(normalizeText(entry.quote))) {
      unverified += 1
      continue
    }
    // 2. 要求里不能有禁用词
    if (findForbiddenWords(entry.quote).length > 0) continue

    const requirement: JdRequirement = {
      id: seed.next('req'),
      text: entry.quote,
      keywords: catalogKeywordsOf(entry.quote),
    }
    requirements.push(requirement)

    // 3. 引用的要点序号必须指向真实存在的要点
    const matchedBulletIds: string[] = []
    for (const ordinal of entry.bullets) {
      const bullet = bulletsByOrdinal.get(ordinal)
      if (!bullet) {
        outOfRange += 1
        continue
      }
      matchedBulletIds.push(bulletIdOf(draft, bullet.ordinal))
    }

    const texts = matchedBulletIds.map((id) => bulletTextOf(draft, id))
    const tier = decideTier(entry.tier, texts)

    for (const id of matchedBulletIds) {
      hitsPerBullet.set(id, (hitsPerBullet.get(id) ?? 0) + 1)
    }

    coverage.push({
      requirementId: requirement.id,
      text: requirement.text,
      keywords: requirement.keywords,
      tier: tier.tier,
      approximate: false,
      reason: tier.reason,
      matchedBulletIds: tier.tier === 'none' ? [] : matchedBulletIds,
    })
  }

  if (unverified > 0) {
    warnings.push(`有 ${unverified} 条模型给出的要求在 JD 原文中没有找到，已略过`)
  }
  if (outOfRange > 0) {
    warnings.push(`有 ${outOfRange} 处模型指向了不存在的简历要点，已略过`)
  }

  const evidence = buildEvidence(draft, hitsPerBullet)

  const lines = jdText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const role = lines.length > 0 ? detectRoleName(lines, 1) : { name: '版本 1', source: 'fallback' as const }

  return {
    jd: {
      id: seed.next('jd'),
      rawText: jdText,
      roleName: role.name,
      roleNameSource: role.source,
      requirements,
    },
    coverage,
    evidence,
    warnings,
  }
}

/**
 * 决定一条要求的分档。
 *
 * **不采信模型自评的强度**——「强覆盖」要有一条命中的要点带结果信号；
 * 命中的要点全是规划性表述 → 判未覆盖（对应规格里「仅有规划性表述视为
 * 没有对应事实」那条）。
 */
function decideTier(
  claimed: 'strong' | 'weak' | 'none',
  matchedTexts: string[],
): { tier: 'strong' | 'weak' | 'none'; reason: RequirementCoverage['reason'] } {
  // 模型说没命中，就当没命中
  if (claimed === 'none') return { tier: 'none', reason: 'no-match' }

  // 说了命中却一条都指不出来 → 没有对应事实
  if (matchedTexts.length === 0) return { tier: 'none', reason: 'no-match' }

  // 命中的要点全是规划性表述 → 没有对应事实
  if (matchedTexts.every((text) => isPlanned(text))) {
    return { tier: 'none', reason: 'planned-only' }
  }

  // 说「强覆盖」但没有结果信号 → 降为弱覆盖
  if (claimed === 'strong' && !matchedTexts.some((text) => hasResultSignal(text))) {
    return { tier: 'weak', reason: null }
  }

  return { tier: claimed, reason: null }
}

/**
 * 由「要求→要点」的引用反推要点证据。
 *
 * 被引用的要点算与 JD 相关，相关度按被引用的要求数与结果信号算——
 * 与规则路径的量级一致，排序与删减的行为不会差太远。
 */
function buildEvidence(draft: Draft, hitsPerBullet: Map<string, number>): BulletEvidence[] {
  const evidence: BulletEvidence[] = []
  let draftIndex = 0

  for (const section of draft.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        const hits = hitsPerBullet.get(bullet.id) ?? 0
        const hasResult = hasResultSignal(bullet.text)
        evidence.push({
          bulletId: bullet.id,
          text: bullet.text,
          sectionId: section.id,
          sectionKind: section.kind,
          itemId: item.id,
          draftIndex,
          relevance: 3 * hits + (hasResult ? 2 : 0),
          hasResult,
          planned: isPlanned(bullet.text),
          exactTerms: new Set<string>(),
          relatedByEntry: new Map<string, Set<string>>(),
          approxRequirements: new Set<string>(),
          jdRelated: hits > 0,
        })
        draftIndex += 1
      }
    }
  }

  return evidence
}

/** 序号 → 要点 id。序号是模型看见的编号。 */
function bulletIdOf(draft: Draft, ordinal: number): string {
  let index = 0
  for (const section of draft.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        index += 1
        if (index === ordinal) return bullet.id
      }
    }
  }
  return ''
}

/** 要点 id → 正文。 */
function bulletTextOf(draft: Draft, bulletId: string): string {
  for (const section of draft.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        if (bullet.id === bulletId) return bullet.text
      }
    }
  }
  return ''
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '模型调用失败'
}
