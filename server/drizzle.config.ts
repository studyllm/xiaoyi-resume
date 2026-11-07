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
})
