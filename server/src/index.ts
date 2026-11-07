import { buildApp } from './app'
import { createSmtpMailer } from './auth/smtp'
import { createDatabase } from './db/client'
import { createMemoryIdempotencyStore } from './db/idempotency'
import { createPostgresStore } from './db/store'

/**
 * 启动服务端。
 *
 * 配置全部来自环境变量，密钥不进代码库。
 * 缺哪个就直接报错退出——带着半套配置跑起来的服务端比不启动更糟。
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`缺少环境变量 ${name}`)
    process.exit(1)
  }
  return value
}

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'

const database = createDatabase(required('DATABASE_URL'))

const app = buildApp({
  store: createPostgresStore(database),
  idempotency: createMemoryIdempotencyStore(),
  mailer: createSmtpMailer({
    host: required('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT ?? 465),
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    from: required('MAIL_FROM'),
    secure: process.env.SMTP_SECURE !== 'false',
  }),
  siteUrl: required('SITE_URL'),
  from: required('MAIL_FROM'),
})

app
  .listen({ port, host })
  .then(() => {
    console.log(`服务端已启动：http://${host}:${port}`)
  })
  .catch((error) => {
    console.error('服务端启动失败：', error)
    process.exit(1)
  })
