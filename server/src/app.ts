import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance } from 'fastify'

import type { ResumeGenerator } from '@xiaoyi/shared/engines/generator'

import type { MailSender } from './auth/mailer'
import type { IdempotencyStore } from './db/idempotency'
import { requestIdOf } from './http/logger'
import type { Store } from './db/store'
import { registerAuthRoutes } from './routes/auth'
import { registerEngineRoutes } from './routes/engine'
import { registerHealthz } from './routes/healthz'
import { registerImportRoutes } from './routes/import'
import { registerParse } from './routes/parse'
import { registerResumeRoutes } from './routes/resume'

export interface AppDeps {
  /** 账号、会话与简历版本的存取。 */
  store: Store
  /** 幂等键的记忆。 */
  idempotency: IdempotencyStore
  /** 发信。 */
  mailer: MailSender
  /** 站点对外地址，验证与重置链接指向它。 */
  siteUrl: string
  /** 发信人地址。 */
  from: string
  /** 结构化日志开关。测试里传 false 关掉，免得输出污染用例。 */
  log?: boolean
  /**
   * 版本生成器。规则引擎与模型是同一个接口的两个实现（ADR-0005 §2）——
   * 路由不关心用的是哪个。
   */
  generator: ResumeGenerator
  /** 配了模型供应商就给出模型 id，没配就是 null。 */
  llm: { model: string } | null
}

/**
 * 组装服务端应用。
 *
 * 引擎不在这里实现——它跑的是 `@xiaoyi/shared` 里的同一份源码，
 * 与前端引用的完全相同（ADR-0004）。这就是「同一输入同一输出」的结构保证。
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    // Fastify 自带的 logger 就是 pino，输出结构化 JSON
    logger: deps.log ?? true,
    // 请求日志由下面两个钩子记，字段自己挑过——不要 Fastify 自动记的那套
    disableRequestLogging: true,
  })

  app.addHook('onRequest', async (request, reply) => {
    // 客户端带了请求 id 就用它，方便跨服务追踪
    const given = requestIdOf(request.headers as Record<string, unknown>)
    ;(request as { id: string }).id = given
    reply.header('x-request-id', given)
    request.log.info({ requestId: given, method: request.method, url: request.url }, '收到请求')
  })

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      { requestId: request.id, statusCode: reply.statusCode, url: request.url },
      '请求完成',
    )
  })

  app.setErrorHandler((error: unknown, request, reply) => {
    // 错误上报只带上下文，不带请求体
    const detail =
      error instanceof Error ? { message: error.message, name: error.name } : { message: '未知错误' }
    request.log.error({ requestId: request.id, url: request.url, err: detail }, '请求出错')
    reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: '出了点问题。刷新一下再试。' },
    })
  })

  app.register(cookie)

  registerHealthz(app)
  registerParse(app)
  registerAuthRoutes(app, deps)
  registerImportRoutes(app, { store: deps.store })
  registerEngineRoutes(app, { llm: deps.llm })
  registerResumeRoutes(app, {
    store: deps.store,
    idempotency: deps.idempotency,
    generator: deps.generator,
  })

  return app
}
