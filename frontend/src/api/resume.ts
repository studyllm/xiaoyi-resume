import { api } from './client'
import type { Draft, ResumeVersion } from '@xiaoyi/shared/domain/types'
import type { JdRequirement, RequirementCoverage, RoleNameSource } from '@xiaoyi/shared/domain/types'

export interface DraftResponse {
  draft: Draft
  revision: number
  updatedAt: string
}

/** 解析结果。形状与服务端 `POST /api/v1/draft/parse` 的响应一致。 */
export interface ParseResponse {
  draft: Draft
  confidence: number
  warnings: string[]
  /** 被放进「其它」分区的那些表头。 */
  otherHeaders: string[]
}

/**
 * 解析简历正文。
 *
 * **公开端点**——导入页允许未登录的人粘贴、解析、在纸上修改（ADR-0002 §2）。
 * 纯计算不落库：解析结果拿回来供编辑，用户点保存时才 PUT 上去，服务端在保存
 * 时校验（契约 §4.2）。
 */
export function parseResume(text: string): Promise<ParseResponse> {
  return api<ParseResponse>('/api/v1/draft/parse', { method: 'POST', body: { text } })
}

/** 读简历底稿。没有就是没有——服务端返回 404，不是空对象。 */
export function fetchDraft(signal?: AbortSignal): Promise<DraftResponse> {
  return api<DraftResponse>('/api/v1/draft', { signal })
}

/**
 * 保存简历底稿。
 *
 * `revision` 是当前修订号，用 If-Match 带过去：服务端发现它变了就拒绝，
 * 别把别处的改动覆盖掉（契约 §4.2）。
 */
export function saveDraft(
  draft: Draft,
  revision: number,
): Promise<{ revision: number; savedAt: string }> {
  return api<{ revision: number; savedAt: string }>('/api/v1/draft', {
    method: 'PUT',
    body: { draft },
    headers: { 'If-Match': String(revision) },
  })
}

export function fetchVersions(signal?: AbortSignal): Promise<{
  items: ResumeVersion[]
  total: number
}> {
  return api<{ items: ResumeVersion[]; total: number }>('/api/v1/versions', { signal })
}

export function fetchVersion(id: string, signal?: AbortSignal): Promise<{ version: ResumeVersion }> {
  return api<{ version: ResumeVersion }>(`/api/v1/versions/${id}`, { signal })
}

export async function createVersion(input: {
  jdText: string
  name?: string
  options?: {
    allowVerbFronting?: boolean
    dropIrrelevantProjects?: boolean
    /** 这次要不要用模型改写。默认不用——发不发第三方要用户自己点头。 */
    useLlm?: boolean
  }
  idempotencyKey: string
}): Promise<{ version: ResumeVersion }> {
  return api<{ version: ResumeVersion }>('/api/v1/versions', {
    method: 'POST',
    body: input,
    idempotencyKey: input.idempotencyKey,
    // 生成这一步最多两次模型调用：比对与改写
    timeoutMs: await clientTimeoutMs(2),
  })
}

export function deleteVersion(id: string): Promise<void> {
  return api<void>(`/api/v1/versions/${id}`, { method: 'DELETE' })
}

/**
 * 把本机存的那份搬上服务端。
 *
 * 一次性迁移用（计划 T3.8）。**不做静默迁移**——用户点了才搬，
 * 搬完服务端那份就是权威。
 */
export function importLocalDraft(input: {
  draft?: { v: number; data: unknown } | null
  versions?: Array<{ v: number; data: unknown }>
}): Promise<{
  draft: boolean
  versions: number
  discarded: Array<{ key: string; reason: string }>
}> {
  return api<{
    draft: boolean
    versions: number
    discarded: Array<{ key: string; reason: string }>
  }>('/api/v1/draft/import-local', { method: 'POST', body: input })
}

/**
 * 服务端有没有配模型供应商。
 *
 * 没配的时候，前端那个「本次用模型」的开关不显示——按了没反应比不显示更让人困惑。
 *
 * `timeoutMs` 是服务端下发的等待上限——两边各写一个数迟早会脱节。
 */
export function fetchEngineStatus(
  signal?: AbortSignal,
): Promise<{ available: boolean; timeoutMs: number | null }> {
  return api<{ available: boolean; timeoutMs: number | null }>('/api/v1/engine', { signal })
}

/**
 * 服务端下发的单次模型调用上限。
 *
 * **问一次就够**——它是部署配置，不会在一次会话里变。
 */
let engineTimeout: Promise<number | null> | null = null

function engineTimeoutMs(): Promise<number | null> {
  if (!engineTimeout) {
    engineTimeout = fetchEngineStatus()
      .then((status) => status.timeoutMs)
      .catch(() => null)
  }
  return engineTimeout
}

/**
 * 客户端等待上限。
 *
 * **服务端说等多久，客户端就等多久**——两边各写一个数迟早会脱节，
 * 契约里那个「30 秒」会把每一次真实的模型调用都掐掉。
 *
 * `calls` 是这个请求最多会发起几次模型调用：比对一次，生成最多两次
 * （比对 + 改写）。余量留给规则计算与网络。
 */
const CLIENT_TIMEOUT_MARGIN_MS = 60_000

async function clientTimeoutMs(calls: number): Promise<number | undefined> {
  const serverTimeout = await engineTimeoutMs()
  if (serverTimeout === null) return undefined
  return serverTimeout * calls + CLIENT_TIMEOUT_MARGIN_MS
}

/** 一份 JD 比对的结果。 */
export interface JdAnalysisResponse {
  analysisId: string
  roleName: string
  roleNameSource: RoleNameSource
  requirements: JdRequirement[]
  coverage: RequirementCoverage[]
  warnings: string[]
  /** 谁做的这次比对。 */
  engine: 'rules' | 'llm'
  /** 这次没有完全用上模型（模型不可用、回落了规则目录）。 */
  degraded: boolean
  /** 没完全用上的原因。 */
  degradeReason: string | null
  /** 这次比对的范围：简历里共多少条要点、实际比对了多少条。 */
  scope: { totalBullets: number; comparedBullets: number }
}

/**
 * 比对一份 JD 与你的简历。
 *
 * **跑在已保存的简历上**——前端要先存再分析。
 *
 * 同一份简历与同一份 JD 重复解析时，服务端直接返回第一次的结果，
 * 不会重复调模型（`docs/api-contract.md` §6）。
 */
export async function analyzeJd(
  jdText: string,
  options?: { useLlm?: boolean },
): Promise<JdAnalysisResponse> {
  return api<JdAnalysisResponse>('/api/v1/jd/analyze', {
    method: 'POST',
    body: { jdText, options: { useLlm: options?.useLlm === true } },
    timeoutMs: await clientTimeoutMs(1),
  })
}

/**
 * 记下这个账号同意把简历内容发给模型供应商。
 *
 * 老账号没有同意记录时，用户在界面上打开「本次用模型」会走到这里——
 * **那一刻就是他的点头**。
 */
export function recordModelConsent(): Promise<{ modelConsentAt: string }> {
  return api<{ modelConsentAt: string }>('/api/v1/me/model-consent', { method: 'POST' })
}
