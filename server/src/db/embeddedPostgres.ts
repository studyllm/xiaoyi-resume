import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import EmbeddedPostgres from 'embedded-postgres'

export interface EmbeddedDatabase {
  connectionString: string
  stop(): Promise<void>
}

/**
 * 起一个内嵌的 Postgres。
 *
 * 用它跑真库测试：Drizzle 的 schema 与迁移 SQL 只有对着真库跑过才算验证过。
 * 镜像仓库拉不动的时候（本机 registry 不通），它是唯一能拿到真 Postgres 的办法。
 *
 * 数据目录在临时目录里，停止即销毁——不留残留。
 */
export async function startEmbeddedPostgres(): Promise<EmbeddedDatabase> {
  const databaseDir = await mkdtemp(join(tmpdir(), 'xiaoyi-pg-'))
  const cluster = new EmbeddedPostgres({
    databaseDir,
    user: 'xiaoyi',
    password: 'xiaoyi',
    port: 5433,
    persistent: false,
  })

  await cluster.initialise()
  await cluster.start()
  await cluster.createDatabase('xiaoyi')

  return {
    connectionString: 'postgres://xiaoyi:xiaoyi@localhost:5433/xiaoyi',
    stop: () => cluster.stop(),
  }
}
