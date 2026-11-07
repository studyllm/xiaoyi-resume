import { defineConfig } from 'drizzle-kit'

/**
 * 迁移配置。
 *
 * 迁移 SQL 落在 `src/db/migrations/`，进版本库、能手工审。
 * 生成迁移不需要连数据库（`drizzle-kit generate` 只读 schema）。
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  // 迁移要连上真库。连接串来自环境变量，密钥不进代码库。
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://xiaoyi:xiaoyi_local_dev@127.0.0.1:5432/xiaoyi',
  },
})
