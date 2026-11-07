import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

/**
 * 连上 Postgres。
 *
 * 连接串来自环境变量——密钥不进代码库（`docs/privacy-conclusions.md` §4.2）。
 */
export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString })
  return drizzle(pool, { schema })
}
