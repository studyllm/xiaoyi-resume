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
 * 认证信息。`code` 是机器可读的那一份（`ECONNREFUSED`、SMTP 的 `535`），
 * 排障时比 `message` 更好用。
 */
export function errorDetail(error: unknown): { name: string; message: string; code?: string } {
  if (!(error instanceof Error)) return { name: 'Error', message: '未知错误' }
  const code = (error as { code?: unknown }).code
  return {
    name: error.name,
    message: error.message,
    ...(typeof code === 'string' ? { code } : {}),
  }
}
