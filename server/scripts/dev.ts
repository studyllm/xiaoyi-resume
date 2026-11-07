/**
 * 不依赖 Docker 的开发服务端。
 *
 * 镜像仓库拉不动的时候（本机 registry 不通），用内嵌的 Postgres 起一个开发环境：
 * 迁移跑完，服务端监听 3000。数据在临时目录里，进程退出即销毁。
 *
 * 正式的本地环境用 `npm run db:up`（docker-compose.yml）——那个数据是持久的。
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { buildApp } from '../src/app'
import { createMemoryMailer } from '../src/auth/mailer'
import { startEmbeddedPostgres } from '../src/db/embeddedPostgres'
import * as schema from '../src/db/schema'
import { createMemoryIdempotencyStore } from '../src/db/idempotency'
import { createPostgresStore } from '../src/db/store'

const port = Number(process.env.PORT ?? 3000)

const embedded = await startEmbeddedPostgres()
const pool = new Pool({ connectionString: embedded.connectionString })
const database = drizzle(pool, { schema })
await migrate(database, {
  migrationsFolder: new URL('../src/db/migrations', import.meta.url).pathname,
})

const app = buildApp({
  store: createPostgresStore(database),
  idempotency: createMemoryIdempotencyStore(),
  // 开发环境不发真邮件：信打在这里，链接照样能点
  mailer: createMemoryMailer(),
  siteUrl: `http://localhost:5173`,
  from: 'noreply@xiaoyi.local',
})

await app.listen({ port, host: '127.0.0.1' })
console.log(`服务端已启动：http://127.0.0.1:${port}（内嵌 Postgres，邮件不发真信）`)
