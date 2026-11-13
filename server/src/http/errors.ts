import type { FastifyReply } from 'fastify'

import { ERROR_CODES, type ErrorCode } from '@xiaoyi/shared/contracts/error-codes'
import { ALL_STATES } from '@xiaoyi/shared/domain/states'

/**
 * 按错误码表生成错误响应。
 *
 * **文案只有一处来源**：`ALL_STATES` 里那条状态的标题。服务端不另写文案——
 * 两处各写一套，正是 P2 刚消灭掉的问题。
 *
 * `message` 只是兜底：前端优先按 `code` 从自己的状态表取文案。
 */
/**
 * 数据库报「列或表不存在」时的可操作提示。
 *
 * 库比代码旧（迁移没跑）时，查询会报 `42703 undefined_column` 或
 * `42P01 undefined_table`。Drizzle 的错误消息是「Failed query: select …」——
 * 没人能据此行动，要直接告诉他跑迁移。
 *
 * 返回 null 表示不是这一类错误。
 */
export function describeMissingSchema(error: unknown): string | null {
  const cause = (error as { cause?: unknown } | null)?.cause
  const code = (cause as { code?: unknown } | null)?.code
  if (code === '42703' || code === '42P01') {
    return '数据库版本比代码旧（缺少表或列）。请跑 npm run db:migrate，然后重启服务端。'
  }
  return null
}

export function sendError(reply: FastifyReply, code: ErrorCode): FastifyReply {
  const spec = ERROR_CODES[code]
  const state = ALL_STATES[spec.state]
  return reply.code(spec.http).send({
    error: {
      code,
      message: state?.title ?? code,
    },
  })
}
