import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import type { Draft, ResumeVersion } from '@xiaoyi/shared/domain/types'

import { currentUser } from '../auth/session'
import type { Store } from '../db/store'
import { migrateMany } from '../db/migrate'
import { sendError } from '../http/errors'

interface Stored<T> {
  v: number
  data: T
}

function looksLikeDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as { sections?: unknown }).sections)
}

function looksLikeVersion(value: unknown): value is ResumeVersion {
  if (!value || typeof value !== 'object') return false
  const version = value as { sections?: unknown; body?: unknown }
  return Array.isArray(version.sections) && typeof version.body === 'string'
}

/**
 * 迁移本地存量数据。
 *
 * 一份失败不影响其余——丢掉那一份，其余照常导入，并说明丢了什么。
 * 这是「失败不白屏」在批量场景下的样子（范式来自 `stores/persistence.ts`）。
 */
export function registerImportRoutes(app: FastifyInstance, deps: { store: Store }): void {
  const { store } = deps

  app.post('/api/v1/draft/import-local', async (request, reply) => {
    const user = await currentUser(store, request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const body = request.body as {
      draft?: Stored<unknown> | null
      versions?: Array<Stored<unknown>>
    }

    const discarded: Array<{ key: string; reason: string }> = []

    // 底稿
    let draftImported = false
    if (body?.draft) {
      const result = migrateMany<Draft>([{ key: 'draft', raw: body.draft.data }], () => [])
      if (result.discarded.length > 0) {
        discarded.push(...result.discarded)
      } else if (result.migrated[0] && looksLikeDraft(result.migrated[0])) {
        await store.saveDraft({
          userId: user.id,
          payload: result.migrated[0],
          revision: 1,
        })
        draftImported = true
      } else {
        discarded.push({ key: 'draft', reason: '这份简历的结构认不出来' })
      }
    }

    // 版本：逐个来，一个坏了不影响其它
    const versionItems = (body?.versions ?? []).map((item, index) => ({
      key: `version-${index}`,
      raw: item?.data,
    }))
    const migrated = migrateMany<ResumeVersion>(versionItems, () => [])
    for (const item of migrated.discarded) discarded.push(item)

    let versionCount = 0
    for (const version of migrated.migrated) {
      if (!looksLikeVersion(version)) {
        discarded.push({ key: 'version', reason: '这个版本的结构认不出来' })
        continue
      }
      await store.addVersion({
        id: randomUUID(),
        userId: user.id,
        payload: version,
        createdAt: new Date(version.createdAt ?? Date.now()),
      })
      versionCount += 1
    }

    return { draft: draftImported, versions: versionCount, discarded }
  })
}
