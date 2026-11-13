import { createHash } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import type { Draft } from '@xiaoyi/shared/domain/types'
import { toStoredAnalysis } from '@xiaoyi/shared/engines/jdAnalysis'
import type { JdAnalyzer } from '@xiaoyi/shared/engines/types'

import { currentUser } from '../auth/session'
import type { JdAnalysisKey, Store, StoredJdAnalysis } from '../db/store'
import { sendError } from '../http/errors'

/** 每个账号最多留几份比对结果。超出的删最旧的。 */
const ANALYSES_PER_ACCOUNT = 20

export interface JdRouteDeps {
  store: Store
  /** 比对的端口。规则引擎与模型是同一个接口的两个实现。 */
  analyzer: JdAnalyzer
}

/**
 * JD 比对。
 *
 * **跑在已保存的简历上**——前端先存后分析，比对的就是服务端那份。
 *
 * **同一把键上只算一次**（ADR-0005 §3「同输入缓存」）：键是
 * （用户、简历修订号、JD 哈希、模式）。第二次点「解析 JD」直接返回第一次
 * 的结果，不重复调模型、不重复计费。
 */
export function registerJdRoutes(app: FastifyInstance, deps: JdRouteDeps): void {
  const { store, analyzer } = deps

  app.post('/api/v1/jd/analyze', async (request, reply) => {
    const user = await currentUser(store, request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')

    const body = request.body as {
      jdText?: unknown
      options?: { useLlm?: boolean }
    }
    if (typeof body?.jdText !== 'string' || !body.jdText.trim()) {
      return sendError(reply, 'JD_EMPTY')
    }

    const draftRow = await store.getDraft(user.id)
    if (!draftRow) return sendError(reply, 'RESUME_NOT_FOUND')

    // 用户要不要用模型。**没有账号级同意就不发**——同意是账号级的，
    // 这里只管这一次。服务端自己查，不信客户端传来的开关。
    const useLlm = await mayUseModel(store, user.id, body.options?.useLlm === true)
    const mode: 'llm' | 'rules' = useLlm ? 'llm' : 'rules'

    const key: JdAnalysisKey = {
      userId: user.id,
      draftRevision: draftRow.revision,
      jdHash: jdHashOf(body.jdText),
      mode,
    }

    const cached = await store.findJdAnalysis(key)
    if (cached) return reply.code(200).send(toResponse(cached))

    const result = await analyzer.analyze(
      draftRow.payload,
      body.jdText,
      { now: new Date().toISOString(), engineVersion: 'server-0.1.0' },
      { useLlm },
    )

    const row: StoredJdAnalysis = {
      id: '',
      userId: user.id,
      draftRevision: draftRow.revision,
      jdHash: key.jdHash,
      mode,
      model: result.model,
      promptVersion: result.promptVersion,
      status: result.degraded ? 'degraded' : 'ok',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      degradeReason: result.degradeReason ?? null,
      payload: toStoredAnalysis(result),
      createdAt: new Date(),
    }

    await store.saveJdAnalysis(row)
    // 只留最近的若干份——比对记录会攒起来，不清就无限长
    await store.pruneJdAnalyses(user.id, ANALYSES_PER_ACCOUNT)

    // **读回存进去的那一行**：id 是存储层给的（新建时由它生成），
    // 同一把键覆盖时沿用旧 id。
    const saved = await store.findJdAnalysis(key)
    return reply.code(200).send(toResponse(saved ?? row))
  })
}

/** JD 的哈希。日志与缓存键靠它判断是不是同一份 JD。 */
export function jdHashOf(jdText: string): string {
  return createHash('sha256').update(jdText).digest('hex').slice(0, 32)
}

/**
 * 这次能不能用模型。
 *
 * **两个条件都要满足**：用户这次选了用模型，且账号同意过把内容发给模型供应商。
 *
 * 同意是账号级的（`docs/privacy-conclusions.md` §7）——**服务端自己查**，
 * 不信客户端传来的开关：一个改过的客户端不能靠发 `useLlm: true` 就把简历
 * 发出去。
 */
export async function mayUseModel(
  store: Store,
  userId: string,
  requested: boolean,
): Promise<boolean> {
  if (!requested) return false
  return (await store.modelConsentAt(userId)) !== null
}

/** 比对结果 → 响应。 */
export function toResponse(row: StoredJdAnalysis): Record<string, unknown> {
  const payload = row.payload
  const totalBullets = payload.bulletsTotal ?? payload.evidence.length
  return {
    analysisId: row.id,
    roleName: payload.jd.roleName,
    roleNameSource: payload.jd.roleNameSource,
    requirements: payload.jd.requirements,
    coverage: payload.coverage,
    warnings: payload.warnings,
    engine: payload.engine,
    degraded: payload.degraded,
    degradeReason: payload.degradeReason,
    // 这次比对的范围：简历里共多少条要点、实际比对了多少条
    scope: {
      totalBullets,
      comparedBullets: payload.bulletsCompared ?? totalBullets,
    },
  }
}

/**
 * 取一份比对结果：命中缓存就用缓存，没命中就现算。
 *
 * **版本生成走这里**——第二步看到的与版本详情里的必须是同一份。
 */
export async function resolveAnalysis(
  store: Store,
  analyzer: JdAnalyzer,
  userId: string,
  draft: Draft,
  draftRevision: number,
  jdText: string,
  useLlm: boolean,
): Promise<StoredJdAnalysis> {
  // 同意是账号级的——服务端自己查，不信客户端传来的开关
  const allowed = await mayUseModel(store, userId, useLlm)
  const mode: 'llm' | 'rules' = allowed ? 'llm' : 'rules'
  const key: JdAnalysisKey = {
    userId,
    draftRevision,
    jdHash: jdHashOf(jdText),
    mode,
  }

  const cached = await store.findJdAnalysis(key)
  if (cached) return cached

  const result = await analyzer.analyze(
    draft,
    jdText,
    { now: new Date().toISOString(), engineVersion: 'server-0.1.0' },
    { useLlm: allowed },
  )

  const row: StoredJdAnalysis = {
    id: '',
    userId,
    draftRevision,
    jdHash: key.jdHash,
    mode,
    model: result.model,
    promptVersion: result.promptVersion,
    status: result.degraded ? 'degraded' : 'ok',
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    degradeReason: result.degradeReason ?? null,
    payload: toStoredAnalysis(result),
    createdAt: new Date(),
  }

  await store.saveJdAnalysis(row)
  await store.pruneJdAnalyses(userId, ANALYSES_PER_ACCOUNT)
  // 读回存进去的那一行——id 是存储层给的
  return (await store.findJdAnalysis(key)) ?? row
}
