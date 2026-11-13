/**
 * 版本生成的两个实现：规则引擎与模型。
 *
 * ADR-0005 §2：两者是同一个 `ResumeGenerator` 接口的两个实现。
 * 回退、降级、灰度对比都在这个接口后面——视图与状态层不感知实现差异。
 *
 * **模型的输出不被信任**：它写的每一条断言都要过事实账本，不合格就换回规则产出。
 */
import { createIdSeed, type IdSeed } from '../domain/ids'
import type {
  Claim,
  DiffEntry,
  Draft,
  ExplainModelCall,
  Fact,
  IntegrityObservation,
  IntegrityViolation,
  ResumeVersion,
  VersionBullet,
} from '../domain/types'
import { buildExplain } from './explain'
import { generateVersion } from './generateVersion'
import { assertCleanOutput } from './forbidden'
import {
  draftTermsOf,
  extractComponents,
  extractFactsByBullet,
  makeClaim,
  verifyClaim,
} from './ledger'
import {
  PROMPT_VERSION,
  buildRewritePrompt,
  parseRewrites,
  toPromptBullet,
} from './llmPrompt'
import { normalizeModelText } from './transforms'
import { assembleBody, diffReason } from './versionAssembly'
import type { EngineContext, GenerateOptions, GenerateVersionResult } from './types'

/** 一次生成的记录。落进 `generations` 表。 */
export interface GenerationTrace {
  engine: 'rules' | 'llm'
  model: string | null
  promptVersion: string | null
  promptTokens: number
  completionTokens: number
  /** 模型的原始输出。审计要靠它。 */
  rawOutput: string | null
  /** 模型不可用时的原因。 */
  error: string | null
  /** 有多少条要点没有直接用生成器的产出 */
  reverted: number
  /** 这次生成没有完全用上模型 */
  degraded: boolean
}

export interface GenerationResult extends GenerateVersionResult {
  trace: GenerationTrace
}

export interface ResumeGenerator {
  /**
   * 生成一版。
   *
   * **异步**：模型调用天生是异步的，端口不能假装它是同步的——
   * 假装同步就要么阻塞事件循环，要么把 promise 藏起来（计划 §11 的冻结点 F1）。
   */
  generate(
    draft: Draft,
    jdText: string,
    ctx: EngineContext,
    options?: GenerateOptions,
    seed?: IdSeed,
  ): Promise<GenerationResult>
}

/** 规则引擎实现。零成本——它就是现在那个 `generateVersion`。 */
export const rulesGenerator: ResumeGenerator = {
  async generate(draft, jdText, ctx, options = {}, seed = createIdSeed()) {
    const result = generateVersion(draft, jdText, ctx, options, seed)
    return {
      ...result,
      trace: {
        engine: 'rules',
        model: null,
        promptVersion: null,
        promptTokens: 0,
        completionTokens: 0,
        rawOutput: null,
        error: null,
        reverted: result.version.integrity.violations.length,
        degraded: false,
      },
    }
  },
}
// ---------------------------------------------------------------- 模型

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
}

export interface ChatCompletionResponse {
  text: string
  promptTokens?: number
  completionTokens?: number
}

/**
 * 模型调用的端口。
 *
 * **实现放在服务端**——密钥不能进浏览器包。共享包只认这个函数形状。
 */
export type ChatCompletion = (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>

export interface LlmGeneratorDeps {
  chat: ChatCompletion
  model: string
  /** 单次生成的输出 token 上限。成本护栏的第一道闸。 */
  maxTokens?: number
  temperature?: number
}

/** 版本里的一条要点，摊平后给模型看。 */
interface FlatBullet {
  ordinal: number
  bullet: VersionBullet
  facts: Fact[]
}

export function createLlmGenerator(deps: LlmGeneratorDeps): ResumeGenerator {
  const { chat, model } = deps
  const temperature = deps.temperature ?? 0
  const maxTokens = deps.maxTokens ?? 2000

  return {
    async generate(draft, jdText, ctx, options = {}, seed = createIdSeed()) {
      // 规则产出既是回退底稿，也是模型不可用时的整版产物
      const baseline = generateVersion(draft, jdText, ctx, options, seed)
      const factsByBullet = extractFactsByBullet(draft)
      const draftTerms = draftTermsOf(draft)

      const flat = flattenBullets(baseline.version, factsByBullet)

      // 「这一版是怎么来的」——两次模型调用的记录。比对那次的来自分析结果，
      // 改写这次的是这里算出来的。
      const analysis = options.analysis ?? null
      const calls: ExplainModelCall[] = []
      if (analysis?.call) {
        calls.push({ stage: 'analyze', ...analysis.call })
      }

      /** 把面板数据挂到版本上。 */
      const withExplain = (
        result: GenerationResult,
        rewriteCall: ExplainModelCall | null,
      ): GenerationResult => {
        if (rewriteCall) calls.push(rewriteCall)
        const totalBullets = analysis?.bulletsTotal ?? result.version.diff.length
        const comparedBullets = analysis?.bulletsCompared ?? totalBullets
        const explain = buildExplain({
          version: result.version,
          coverage: result.coverage,
          selection: analysis?.selection ?? null,
          scope: { comparedBullets, totalBullets },
          calls,
        })
        return { ...result, version: { ...result.version, explain } }
      }

      const rewriteCall = (input: {
        bulletsSent: number
        promptTokens: number
        completionTokens: number
        degraded: boolean
        degradeReason: string | null
      }): ExplainModelCall => ({
        stage: 'rewrite',
        model,
        promptVersion: PROMPT_VERSION,
        bulletsSent: input.bulletsSent,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        degraded: input.degraded,
        degradeReason: input.degradeReason,
      })

      // 用户这次不要用模型：全程走规则引擎，简历正文不发给任何第三方。
      if (options.useLlm === false) {
        return withExplain(
          rulesOutcome(baseline, { error: null, model: null, bullets: flat.length }),
          null,
        )
      }

      if (flat.length === 0) {
        return withExplain(
          rulesOutcome(baseline, { error: '这一版没有可改写的要点', model, bullets: 0 }),
          rewriteCall({
            bulletsSent: 0,
            promptTokens: 0,
            completionTokens: 0,
            degraded: true,
            degradeReason: '这一版没有可改写的要点',
          }),
        )
      }

      const prompt = buildRewritePrompt({
        role: baseline.version.jdRoleName,
        requirements: baseline.version.coverage,
        bullets: flat.map((entry) =>
          toPromptBullet(String(entry.ordinal), entry.facts, entry.bullet.text),
        ),
      })

      let raw: string
      let promptTokens = 0
      let completionTokens = 0
      try {
        const response = await chat({
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
        const reason = messageOf(error)
        return withExplain(
          rulesOutcome(baseline, { error: reason, model, bullets: flat.length }),
          rewriteCall({
            bulletsSent: flat.length,
            promptTokens: 0,
            completionTokens: 0,
            degraded: true,
            degradeReason: reason,
          }),
        )
      }

      const rewrites = parseRewrites(raw)
      if (!rewrites) {
        const reason = '模型返回的内容无法解析'
        return withExplain(
          rulesOutcome(baseline, {
            error: reason,
            model,
            rawOutput: raw,
            promptTokens,
            completionTokens,
            bullets: flat.length,
          }),
          rewriteCall({
            bulletsSent: flat.length,
            promptTokens,
            completionTokens,
            degraded: true,
            degradeReason: reason,
          }),
        )
      }

      const byKey = new Map(rewrites.map((rewrite) => [rewrite.key, rewrite]))
      const violations: IntegrityViolation[] = []
      const observations: IntegrityObservation[] = []
      const claims: Claim[] = []
      const patched = new Map<string, string>()
      let adopted = 0

      /** 这次发出去的事实总数——用来判断模型给的编号是不是「指到别处去了」。 */
      const totalFacts = flat.reduce((sum, entry) => sum + entry.facts.length, 0)

      for (const entry of flat) {
        const rewrite = byKey.get(String(entry.ordinal))
        if (!rewrite) continue

        const resolved = rewrite.clauses.map((index) => entry.facts[index - 1])
        const claimId = `llm-${entry.bullet.id}`

        /**
         * 模型给的子句编号对不上时，改用**这条要点自己的全部事实**复核。
         *
         * 模型很容易把子句编号当成全局连续的——「要点 4」给的是子句 [4,5,6,7]，
         * 而这条要点自己只有两三个子句。照抄编号就查不到依据，每条改写都会被
         * 当成「没指出依据」丢掉——**模型白改，全版回落规则引擎**。
         *
         * 改用全部事实不放松底线：这句话仍然要通过事实校验，只是比对的范围
         * 从「模型自称用的那几条」变成「这条要点本来有的全部事实」——和规则
         * 路径一个口径（规则路径也是拿整条要点的事实去校验改写后的正文）。
         *
         * **编号指到别处去了**（它的号在这次发出去的事实里确实存在）与
         * **编号是编的**（号比这次的事实总数还大）要分开：后者照旧丢掉。
         */
        const offBy = resolved.some((fact) => !fact)
        const pointsSomewhere = rewrite.clauses.every(
          (index) => index >= 1 && index <= totalFacts,
        )
        const cited = offBy && pointsSomewhere ? entry.facts : resolved

        if (cited.length === 0 || (offBy && !pointsSomewhere)) {
          violations.push({
            bulletId: entry.bullet.id,
            claimId,
            kind: 'unreferenced',
            reason: '模型没有指出它依据了哪些事实',
            originalText: entry.bullet.text,
            revertedText: entry.bullet.text,
          })
          continue
        }

        if (offBy) {
          observations.push({
            bulletId: entry.bullet.id,
            kind: 'clause-index-missed',
            detail: '模型给的子句编号对不上，按这条要点的全部事实复核',
          })
        }

        // 排版跟规则引擎的产出对齐（句末标点、半角、技术词大小写）。
        // **只排版，不动词、不动语序**——那是模型自己的活。
        const text = normalizeModelText(rewrite.text)

        const claim = makeClaim({
          claimId,
          bulletId: entry.bullet.id,
          text,
          operation: cited.length > 1 ? 'merge' : 'rewrite',
          sourceFactIds: cited.map((fact) => fact.factId),
        })
        const verdict = verifyClaim(claim, entry.facts, {
          draftTerms,
          metadataComponents: extractComponents(entry.metadata),
        })
        claims.push(claim)
        for (const observation of verdict.observations) {
          observations.push({ bulletId: entry.bullet.id, ...observation })
        }

        if (!verdict.trusted) {
          violations.push({
            bulletId: entry.bullet.id,
            claimId,
            kind: verdict.issues[0]?.kind,
            component: verdict.issues[0]?.component,
            reason: verdict.issues.map((issue) => issue.detail).join('；'),
            originalText: entry.bullet.text,
            revertedText: entry.bullet.text,
          })
          continue
        }

        adopted += 1
        patched.set(entry.bullet.id, text)
      }

      const sections = applyPatchedTexts(baseline.version.sections, patched)
      const diff = applyPatchedDiff(baseline.version.diff, patched)
      const reverted = flat.length - adopted

      const body = assembleBody(sections, baseline.version.profile)

      // **模型写的正文也要过禁用词检查**——规格早就要求，只是没做到。
      // 命中就整版回落规则产出：底线优先于一次生成的成功率。
      try {
        assertCleanOutput(body, '版本正文')
      } catch (error) {
        const reason = error instanceof Error ? error.message : '模型改写后的正文含有界面禁用词'
        return withExplain(
          rulesOutcome(baseline, {
            error: reason,
            model,
            promptTokens,
            completionTokens,
            bullets: flat.length,
          }),
          rewriteCall({
            bulletsSent: flat.length,
            promptTokens,
            completionTokens,
            degraded: true,
            degradeReason: reason,
          }),
        )
      }

      const version: ResumeVersion = {
        ...baseline.version,
        body,
        sections,
        diff,
        integrity: {
          checked: baseline.version.integrity.checked,
          violations: [...baseline.version.integrity.violations, ...violations],
          generator: adopted > 0 ? 'llm' : 'rules',
          reverted,
          degraded: reverted > 0,
          observations: [...baseline.version.integrity.observations, ...observations],
        },
        trace: {
          facts: flat.flatMap((entry) => entry.facts),
          claims,
        },
      }

      return withExplain(
        {
          version,
          coverage: baseline.coverage,
          trace: {
            engine: adopted > 0 ? 'llm' : 'rules',
            model,
            promptVersion: PROMPT_VERSION,
            promptTokens,
            completionTokens,
            rawOutput: raw,
            error: null,
            reverted,
            degraded: reverted > 0,
          },
        },
        rewriteCall({
          bulletsSent: flat.length,
          promptTokens,
          completionTokens,
          // 调用本身成功了——个别改写没过校验不算这次调用没用上
          degraded: false,
          degradeReason: null,
        }),
      )
    },
  }
}

interface FlatEntry extends FlatBullet {
  /** 条目的元数据：公司与职位也是这份简历里的事实。 */
  metadata: string
}

function flattenBullets(version: ResumeVersion, factsByBullet: Map<string, Fact[]>): FlatEntry[] {
  const entries: FlatEntry[] = []
  let ordinal = 0
  for (const section of version.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        ordinal += 1
        entries.push({
          ordinal,
          bullet,
          facts: factsByBullet.get(bullet.id) ?? [],
          metadata: `${item.org ?? ''} ${item.title ?? ''}`,
        })
      }
    }
  }
  return entries
}

/** 把模型改正的正文换进版本结构。 */
function applyPatchedTexts(
  sections: ResumeVersion['sections'],
  patched: Map<string, string>,
): ResumeVersion['sections'] {
  if (patched.size === 0) return sections
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      bullets: item.bullets.map((bullet) => {
        const text = patched.get(bullet.id)
        return text ? { ...bullet, text } : bullet
      }),
    })),
  }))
}

/** 改动对照要跟着正文走。 */
function applyPatchedDiff(
  diff: DiffEntry[],
  patched: Map<string, string>,
): DiffEntry[] {
  if (patched.size === 0) return diff
  return diff.map((entry) => {
    const text = patched.get(entry.bulletId)
    if (!text) return { ...entry, writtenBy: 'rules' }
    const change: DiffEntry['change'] = text === entry.fromText ? 'keep' : 'rewrite'
    return {
      ...entry,
      change,
      toText: text,
      reason: diffReason({ change, placement: entry.placement }),
      // 这一句是模型写的
      writtenBy: 'model',
    }
  })
}

/** 模型整体不可用：整版用规则产出，并标记为降级。 */
function rulesOutcome(
  baseline: GenerateVersionResult,
  extra: {
    error: string | null
    model: string | null
    rawOutput?: string
    promptTokens?: number
    completionTokens?: number
    /** 这一版有多少条要点——模型一条都没用上，全是它。 */
    bullets: number
  },
): GenerationResult {
  return {
    version: {
      ...baseline.version,
      integrity: {
        ...baseline.version.integrity,
        generator: 'rules',
        degraded: extra.error !== null,
        // 原因一起带上：界面要能说清「为什么没用上模型」
        degradeReason: extra.error,
      },
    },
    coverage: baseline.coverage,
    trace: {
      engine: 'rules',
      model: extra.model,
      promptVersion: PROMPT_VERSION,
      promptTokens: extra.promptTokens ?? 0,
      completionTokens: extra.completionTokens ?? 0,
      rawOutput: extra.rawOutput ?? null,
      error: extra.error,
      reverted: extra.bullets,
      degraded: extra.error !== null,
    },
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '模型调用失败'
}
