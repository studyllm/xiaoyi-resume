import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance } from 'fastify'

import type { MailSender } from './auth/mailer'
import type { AccountStore } from './db/store'
import { registerAuthRoutes } from './routes/auth'
import { registerHealthz } from './routes/healthz'
import { registerParse } from './routes/parse'

export interface AppDeps {
  /** 账号与会话的存取。 */
  store: AccountStore
  /** 发信。 */
  mailer: MailSender
  /** 站点对外地址，验证与重置链接指向它。 */
  siteUrl: string
  /** 发信人地址。 */
  from: string
}

/**
 * 组装服务端应用。
 *
 * 引擎不在这里实现——它跑的是 `@xiaoyi/shared` 里的同一份源码，
 * 与前端引用的完全相同（ADR-0004）。这就是「同一输入同一输出」的结构保证。
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cookie)

  registerHealthz(app)
  registerParse(app)
  registerAuthRoutes(app, deps)

  return app
}
