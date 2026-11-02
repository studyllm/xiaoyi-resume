import type { IdSeed } from '@/domain/ids'
import type {
  CoverageTier,
  Diagnosis,
  Draft,
  Jd,
  RequirementCoverage,
  ResumeVersion,
  UncoveredReason,
} from '@/domain/types'

export interface EngineContext {
  /** 注入的时间，引擎内部不读取系统时间 */
  now: string
  engineVersion: string
}

export type ParseFailureReason = 'empty' | 'unrecognized'

export interface ParseFailure {
  reason: ParseFailureReason
  message: string
}

export interface ParseResult {
  ok: boolean
  draft: Draft | null
  confidence: number
  warnings: string[]
  failure: ParseFailure | null
}

export type DiagnosisResult = Diagnosis

export interface GenerateOptions {
  versionName?: string
  existingVersionCount?: number
  dropIrrelevantProjects?: boolean
  allowVerbFronting?: boolean
  maxBulletsPerItem?: number
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
