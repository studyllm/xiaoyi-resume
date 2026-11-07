import { api } from './client'
import type { Draft, ResumeVersion } from '@xiaoyi/shared/domain/types'

export interface DraftResponse {
  draft: Draft
  revision: number
  updatedAt: string
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
  options?: { allowVerbFronting?: boolean; dropIrrelevantProjects?: boolean }
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
