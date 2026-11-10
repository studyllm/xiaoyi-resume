import { api } from './client'
import type { Draft, ResumeVersion } from '@xiaoyi/shared/domain/types'

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

export function createVersion(input: {
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
 */
export function fetchEngineStatus(signal?: AbortSignal): Promise<{ available: boolean }> {
  return api<{ available: boolean }>('/api/v1/engine', { signal })
}
