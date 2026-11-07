import Fastify, { type FastifyInstance } from 'fastify'

import { registerHealthz } from './routes/healthz'
import { registerParse } from './routes/parse'

/**
 * 组装服务端应用。
 *
 * 引擎不在这里实现——它跑的是 `@xiaoyi/shared` 里的同一份源码，
 * 与前端引用的完全相同（ADR-0004）。这就是「同一输入同一输出」的结构保证。
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  registerHealthz(app)
  registerParse(app)

  return app
}
