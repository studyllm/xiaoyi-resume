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
