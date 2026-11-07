import type { FastifyInstance } from 'fastify'

import type { Draft } from '@xiaoyi/shared/domain/types'
import { createIdSeed } from '@xiaoyi/shared/domain/ids'
import { generateVersion } from '@xiaoyi/shared/engines/generateVersion'

import { currentUser } from '../auth/session'
import type { IdempotencyStore } from '../db/idempotency'
import type { Store } from '../db/store'
import { sendError } from '../http/errors'

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

/**
 * 简历与版本的读写端点。
 *
 * **一律要求登录**：数据按账号隔离，这是后端保证的（验收项 A3.2），
 * 不是靠前端藏起来。
 */
export function registerResumeRoutes(
  app: FastifyInstance,
  deps: { store: Store; idempotency: IdempotencyStore },
): void {
  const { store, idempotency } = deps

  async function requireUser(request: Parameters<typeof currentUser>[1]) {
    const user = await currentUser(store, request)
    return user
  }

  app.get('/api/v1/draft', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const draft = await store.getDraft(user.id)
    if (!draft) return sendError(reply, 'RESUME_NOT_FOUND')

    return { draft: draft.payload, revision: draft.revision, updatedAt: draft.updatedAt }
  })

  app.put('/api/v1/draft', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const body = request.body as { draft?: unknown; revision?: unknown }
    if (!body || typeof body !== 'object' || !body.draft) {
      return sendError(reply, 'VALIDATION_FAILED')
    }

    const draft = body.draft as Draft
    const existing = await store.getDraft(user.id)

    // 乐观并发：客户端带的修订号对不上就拒绝，别把别人的改动覆盖掉
    const expected = Number(request.headers['if-match'] ?? body.revision ?? 0)
    const current = existing?.revision ?? 0
    if (expected !== current) {
      return sendError(reply, 'DRAFT_REVISION_CONFLICT')
    }

    await store.saveDraft({
      userId: user.id,
      payload: draft,
      revision: current + 1,
    })

    return { revision: current + 1, savedAt: new Date().toISOString() }
  })

  app.post('/api/v1/versions', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const body = request.body as {
      jdText?: unknown
      name?: unknown
      options?: { allowVerbFronting?: boolean; dropIrrelevantProjects?: boolean }
    }
    if (typeof body?.jdText !== 'string' || !body.jdText.trim()) {
      return sendError(reply, 'JD_EMPTY')
    }

    // 幂等：同键的重复请求返回第一次的结果，不再生成第二份
    const key = request.headers['idempotency-key']
    const idempotencyKey = typeof key === 'string' ? key : null
    if (idempotencyKey) {
      const remembered = idempotency.recall(idempotencyKey)
      if (remembered) return reply.code(201).send(remembered)
    }

    // 版本必须基于已保存的内容，修订号才对得上
    const draftRow = await store.getDraft(user.id)
    if (!draftRow) return sendError(reply, 'RESUME_NOT_FOUND')

    const existing = await store.listVersions(user.id)
    const result = generateVersion(
      draftRow.payload,
      body.jdText,
      { now: new Date().toISOString(), engineVersion: 'server-0.1.0' },
      {
        versionName: typeof body.name === 'string' ? body.name : undefined,
        existingVersionCount: existing.length,
        allowVerbFronting: body.options?.allowVerbFronting ?? true,
        dropIrrelevantProjects: body.options?.dropIrrelevantProjects ?? true,
      },
      createIdSeed(),
    )

    const version = { ...result.version, userId: user.id }
    await store.addVersion({
      id: version.id,
      userId: user.id,
      payload: version,
      createdAt: new Date(version.createdAt),
    })

    const payload = { version }
    if (idempotencyKey) idempotency.remember(idempotencyKey, payload)
    return reply.code(201).send(payload)
  })

  app.get('/api/v1/versions', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const query = request.query as { page?: string; pageSize?: string }
    const page = Math.max(1, Number(query.page ?? 1) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))

    const all = await store.listVersions(user.id)
    // 列表返回完整版本：一份简历的版本通常只有几十个，一并返回省掉前端逐个拉详情。
    // 上限 pageSize 100，最坏情况也就几百 KB。
    const items = all.slice((page - 1) * pageSize, page * pageSize).map((row) => row.payload)

    return { items, page, pageSize, total: all.length }
  })

  app.get('/api/v1/versions/:id', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const id = (request.params as { id: string }).id
    const all = await store.listVersions(user.id)
    const found = all.find((row) => row.id === id)
    if (!found) return sendError(reply, 'VERSION_NOT_FOUND')

    return { version: found.payload }
  })

  app.get('/api/v1/versions/:id/body', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const id = (request.params as { id: string }).id
    const query = request.query as { format?: string }
    const all = await store.listVersions(user.id)
    const found = all.find((row) => row.id === id)
    if (!found) return sendError(reply, 'VERSION_NOT_FOUND')

    const format = query.format === 'markdown' ? 'markdown' : 'text'
    return { format, text: found.payload.body }
  })

  app.delete('/api/v1/versions/:id', async (request, reply) => {
    const user = await requireUser(request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const id = (request.params as { id: string }).id
    const all = await store.listVersions(user.id)
    if (!all.some((row) => row.id === id)) return sendError(reply, 'VERSION_NOT_FOUND')

    await store.deleteVersion(user.id, id)
    return reply.code(204).send()
  })
}
