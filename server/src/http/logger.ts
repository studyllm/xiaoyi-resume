import { randomUUID } from 'node:crypto'

/**
 * 请求 id。
 *
 * 客户端带了就用它的（方便跨服务追踪），没带就自己生成。回在响应头里——
 * 用户截图报错时能把这个编号报给我们，运维按编号就能定位到那一次请求。
 */
export function requestIdOf(headers: Record<string, unknown>): string {
  const given = headers['x-request-id']
  if (typeof given === 'string' && given.trim()) return given.trim().slice(0, 64)
  return randomUUID()
}

/**
 * 日志里不记什么。
 *
 * **简历正文一个都不记。** 日志的可见范围通常远大于数据库——正文一旦进日志，
 * 泄露面就扩大了一倍。Fastify 自带的 pino logger 默认只记方法、路径、状态码与
 * 耗时，不记请求体；下面两个钩子也只带上下文。
 */
export const LOGGED_FIELDS = ['requestId', 'method', 'url', 'statusCode'] as const

/**
 * 错误的可记录明细。
 *
 * **只取白名单字段**，不把错误对象整个丢出去——第三方错误对象上可能带着
 * 认证信息。`code` 是机器可读的那一份（`ECONNREFUSED`、SMTP 的 `EAUTH`），
 * 排障时比 `message` 更好用。
 *
 * `command` 与 `responseCode` 是 SMTP 错误才有的：前者说失败发生在**哪一步**
 * （`AUTH PLAIN` = 认证这一步），后者是服务端回的状态码（526、535）。
 * 光看 message 只知道「认证失败」，看了这两个才知道是认证被拒——那是授权码
 * 不对，不是网络问题。
 */
export function errorDetail(error: unknown): {
  name: string
  message: string
  code?: string
  command?: string
  responseCode?: number
} {
  if (!(error instanceof Error)) return { name: 'Error', message: '未知错误' }
  const extra = error as { code?: unknown; command?: unknown; responseCode?: unknown }
  return {
    name: error.name,
    message: error.message,
    ...(typeof extra.code === 'string' ? { code: extra.code } : {}),
    ...(typeof extra.command === 'string' ? { command: extra.command } : {}),
    ...(typeof extra.responseCode === 'number' ? { responseCode: extra.responseCode } : {}),
  }
}
