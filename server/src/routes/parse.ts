import type { FastifyInstance } from 'fastify'

import { createIdSeed } from '@xiaoyi/shared/domain/ids'
import { parseDraft } from '@xiaoyi/shared/engines/parseDraft'
import type { EngineContext } from '@xiaoyi/shared/engines/types'

/** 引擎版本。写进产物，好知道这份正文是哪套规则产出的。 */
const ENGINE_VERSION = 'server-0.1.0'

/**
 * 解析简历正文。
 *
 * **公开端点**——导入页允许未登录的人粘贴、解析、在纸上修改（ADR-0002 §2）。
 * 纯计算，不落库：解析结果返回给客户端供编辑，用户点保存时才 PUT 上去，
 * 服务端在保存时校验（契约 §4.2）。
 *
 * 时间由服务端注入（契约原则 5），客户端不传时间戳。
 */
export function registerParse(app: FastifyInstance): void {
  app.post('/api/v1/draft/parse', async (request, reply) => {
    const body = request.body as { text?: unknown }

    if (typeof body?.text !== 'string' || !body.text.trim()) {
      return reply.code(422).send({
        error: {
          code: 'RESUME_EMPTY',
          message: '没有可解析的内容',
        },
      })
    }

    const ctx: EngineContext = { now: new Date().toISOString(), engineVersion: ENGINE_VERSION }
    const result = parseDraft(body.text, ctx, createIdSeed())

    if (!result.ok) {
      // 错误码表随鉴权一起落地（契约 §5）；这里先按契约里的名字给。
      return reply.code(422).send({
        error: {
          code: 'PARSE_FAILED',
          message: result.failure?.state.title ?? '解析失败',
        },
      })
    }

    return {
      draft: result.draft,
      confidence: result.confidence,
      warnings: result.warnings,
      otherHeaders: result.otherHeaders,
    }
  })
}
