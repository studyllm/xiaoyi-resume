import type { IdSeed } from '../domain/ids'
import type { StateCopy } from '../domain/states'
import type {
  CoverageTier,
  Diagnosis,
  Draft,
  Jd,
  RequirementCoverage,
  ResumeVersion,
  SectionKind,
  UncoveredReason,
} from '../domain/types'

export interface EngineContext {
  /** 注入的时间，引擎内部不读取系统时间 */
  now: string
  engineVersion: string
}

export type ParseFailureReason = 'empty' | 'unrecognized'

export interface ParseFailure {
  reason: ParseFailureReason
  /** 状态表里对应的那条，文案与用户能做的下一步都在那里。 */
  state: StateCopy
}

export interface ParseResult {
  ok: boolean
  draft: Draft | null
  confidence: number
  warnings: string[]
  /**
   * 被放进「其它」分区的那些表头。
   *
   * 它们不对应教育、经历、项目、技能任何一个分区，内容被收进了「其它」。
   * 用户需要知道是哪几段被这样归置的。
   */
  otherHeaders: string[]
  failure: ParseFailure | null
}

export type DiagnosisResult = Diagnosis

export interface GenerateOptions {
  versionName?: string
  existingVersionCount?: number
  dropIrrelevantProjects?: boolean
  allowVerbFronting?: boolean
  maxBulletsPerItem?: number
  /**
   * 这次要不要用模型改写。
   *
   * **默认不用**——简历正文发给第三方要用户自己点头（`docs/privacy-conclusions.md` §5.1）。
   */
  useLlm?: boolean
  /**
   * 已经算好的 JD 分析结果。
   *
   * **给了就用它，没给就自己算**（规则路径）。分析结果来自 `JdAnalyzer`——
   * 模型路径下它带着模型抽的要求与逐条判定，规则路径下它就是今天的
   * `parseJd` + `evaluateJd`。版本里的覆盖与未覆盖清单用它，
   * 所以第二步看到的与版本详情里的是同一份。
   */
  analysis?: JdAnalysis | null
}

export type { CoverageTier, RequirementCoverage, UncoveredReason }

/**
 * 一条要点与 JD 要求的关系。
 *
 * **放在这里**是因为 `coverage.ts` 与 `types.ts` 会互相引用（覆盖要算分档、
 * 分档要算证据），类型定义得住在两者之外才不构成环。
 */
export interface BulletEvidence {
  bulletId: string
  text: string
  sectionId: string
  sectionKind: SectionKind
  itemId: string
  draftIndex: number
  relevance: number
  hasResult: boolean
  planned: boolean
  exactTerms: Set<string>
  relatedByEntry: Map<string, Set<string>>
  approxRequirements: Set<string>
  jdRelated: boolean
}

/**
 * 要点证据的存档形状。
 *
 * **`Set` 与 `Map` 存不进 jsonb**——落库前要摊平成数组，取出来再装回去。
 */
export interface StoredEvidence {
  bulletId: string
  text: string
  sectionId: string
  sectionKind: SectionKind
  itemId: string
  draftIndex: number
  relevance: number
  hasResult: boolean
  planned: boolean
  exactTerms: string[]
  /** 条目 id → 相关的词。 */
  relatedByEntry: Record<string, string[]>
  approxRequirements: string[]
  jdRelated: boolean
}

/**
 * 一次模型调用的记录。
 *
 * **给用户看的**——「模型是谁、发了什么、贵不贵、多久」。`generations` 表里
 * 已经有这些数据，这里把它随分析结果一起带到界面上。
 */
export interface JdAnalysisCall {
  model: string
  promptVersion: string
  /** 这次发给了模型多少条要点。 */
  bulletsSent: number
  promptTokens: number
  completionTokens: number
  degraded: boolean
  degradeReason: string | null
}

/**
 * 候选筛选的结果。
 *
 * **给用户看的**——「哪条要点参与了比对、哪条没有、为什么」。
 */
export interface JdAnalysisSelection {
  /** 参与比对的要点 id。 */
  comparedBulletIds: string[]
  /** 没参与比对的要点与原因。 */
  dropped: { bulletId: string; reason: string }[]
}

/**
 * 一份 JD 比对的结果。
 *
 * **三样东西缺一不可**：`jd` 带着带 id 的要求（未覆盖清单要按 id 回查原文），
 * `coverage` 是逐条分档，`evidence` 是要点与要求的关联（排序与删减靠它）。
 */
export interface JdAnalysis {
  jd: Jd
  coverage: RequirementCoverage[]
  evidence: BulletEvidence[]
  warnings: string[]
  /** 谁做的这次比对。 */
  engine: 'rules' | 'llm'
  /** 这次没有完全用上模型（模型不可用、回落了规则目录）。 */
  degraded: boolean
  /** 没完全用上的原因。界面要能说清「为什么」。 */
  degradeReason?: string | null
  /** 这次模型调用的记录。规则路径没有。 */
  call?: JdAnalysisCall | null
  /** 候选筛选的结果。规则路径没有筛选，全部要点都参与了比对。 */
  selection?: JdAnalysisSelection | null
  /** 这次参与比对的要点条数。改动之前缓存的比对结果没有这个键。 */
  bulletsCompared?: number
  /** 简历里的要点总数。 */
  bulletsTotal?: number
}

/** 落库的形状：`evidence` 摊平了，其余一样。 */
export interface StoredJdAnalysisPayload {
  jd: Jd
  coverage: RequirementCoverage[]
  evidence: StoredEvidence[]
  warnings: string[]
  engine: 'rules' | 'llm'
  degraded: boolean
  degradeReason: string | null
  /** 改动之前缓存的比对结果没有这个键，按缺省处理。 */
  call?: JdAnalysisCall | null
  /** 改动之前缓存的比对结果没有这个键，按缺省处理。 */
  selection?: JdAnalysisSelection | null
  bulletsCompared?: number
  bulletsTotal?: number
}

export interface JdAnalysisResult extends JdAnalysis {
  /** 这次用的模型。没配供应商或走规则目录时为空。 */
  model: string | null
  promptVersion: string | null
  promptTokens: number
  completionTokens: number
  /** 这次参与比对的要点条数。 */
  bulletsCompared: number
  /** 简历里的要点总数。 */
  bulletsTotal: number
}
/**
 * JD 比对的端口。
 *
 * 规则引擎与模型是同一个接口的两个实现（ADR-0005 §2）——视图与状态层不感知实现差异。
 */
export interface JdAnalyzer {
  /**
   * 比对一份 JD 与一份底稿。
   *
   * **异步**：模型调用天生是异步的，端口不能假装它是同步的。
   */
  analyze(
    draft: Draft,
    jdText: string,
    ctx: EngineContext,
    options?: { useLlm?: boolean },
  ): Promise<JdAnalysisResult>
}

export interface GenerateVersionResult {
  version: ResumeVersion
  coverage: RequirementCoverage[]
}

export interface JdParseResult {
  jd: Jd
  warnings: string[]
}

export interface ResumeEngines {
  parseDraft(rawText: string, ctx: EngineContext, seed: IdSeed): ParseResult
  diagnose(draft: Draft, ctx: EngineContext): DiagnosisResult
  parseJd(jdText: string, ctx: EngineContext, seed?: IdSeed): JdParseResult
  evaluateJd(draft: Draft, jd: Jd, ctx: EngineContext): RequirementCoverage[]
  generateVersion(
    draft: Draft,
    jdText: string,
    ctx: EngineContext,
    options?: GenerateOptions,
    seed?: IdSeed,
  ): GenerateVersionResult
}
