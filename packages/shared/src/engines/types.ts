import type { IdSeed } from '../domain/ids'
import type { StateCopy } from '../domain/states'
import type {
  CoverageTier,
  Diagnosis,
  Draft,
  Jd,
  RequirementCoverage,
  ResumeVersion,
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
}

export type { CoverageTier, RequirementCoverage, UncoveredReason }

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
