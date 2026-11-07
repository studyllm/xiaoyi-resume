import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startEmbeddedPostgres } from './embeddedPostgres'
import * as schema from './schema'
import { createPostgresStore } from './store'

/**
 * 对着**真 Postgres** 跑。
 *
 * Drizzle 的 schema 与迁移 SQL 只有对着真库跑过才算验证过——接口层的语义测试
 * 覆盖不到「SQL 对不对」「唯一索引建没建」「外键有没有级联」。
 */
let pool: Pool
let store: ReturnType<typeof createPostgresStore>

const DRAFT = {
  id: 'draft-1',
  userId: '',
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  profile: { name: '张三', headline: '', contacts: [] },
  sections: [],
}

function versionOf(id: string, userId: string, name: string) {
  return {
    id,
    userId,
    name,
    body: '',
    sections: [],
    diff: [],
    uncovered: [],
    coverage: [],
    integrity: { checked: 0, violations: [] },
    engineVersion: 'x',
    jdRawText: '',
    jdRoleName: '',
    draftRevision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    profile: { name: '', headline: '', contacts: [] },
  }
}

beforeAll(async () => {
  const embedded = await startEmbeddedPostgres()
  pool = new Pool({ connectionString: embedded.connectionString })
  const database = drizzle(pool, { schema })
  await migrate(database, {
    migrationsFolder: new URL('./migrations', import.meta.url).pathname,
  })
  store = createPostgresStore(database)
}, 180000)

afterAll(async () => {
  await pool?.end()
})

describe('Postgres 实现', () => {
  it('迁移 SQL 能跑通，表都建起来了', async () => {
    const result = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    )
    const tables = result.rows.map((row: { table_name: string }) => row.table_name)
    expect(tables).toContain('users')
    expect(tables).toContain('sessions')
    expect(tables).toContain('verification_tokens')
    expect(tables).toContain('drafts')
    expect(tables).toContain('versions')
  })

  it('账号存进去查得回来，邮箱唯一', async () => {
    const user = await store.createUser({ email: 'a@example.com', passwordHash: 'x' })
    expect(user.email).toBe('a@example.com')
    expect(await store.findUserById(user.id)).not.toBeNull()
    expect(await store.findUserByEmail('A@EXAMPLE.COM')).not.toBeNull()

    await expect(store.createUser({ email: 'a@example.com', passwordHash: 'y' })).rejects.toThrow()
  })

  it('会话增删与登出全清', async () => {
    const user = await store.createUser({ email: 'b@example.com', passwordHash: 'x' })
    const other = await store.createUser({ email: 'c@example.com', passwordHash: 'x' })

    await store.createSession({ id: 's1', userId: user.id, expiresAt: new Date(Date.now() + 60000) })
    await store.createSession({ id: 's2', userId: other.id, expiresAt: new Date(Date.now() + 60000) })

    await store.deleteSessionsOfUser(user.id)
    expect(await store.findSession('s1')).toBeNull()
    expect(await store.findSession('s2')).not.toBeNull()
  })

  it('简历与版本按账号隔离', async () => {
    const alice = await store.createUser({ email: 'alice@example.com', passwordHash: 'x' })
    const bob = await store.createUser({ email: 'bob@example.com', passwordHash: 'x' })

    await store.saveDraft({
      userId: alice.id,
      payload: { ...DRAFT, userId: alice.id },
      revision: 1,
    })
    const versionId = randomUUID()
    await store.addVersion({
      id: versionId,
      userId: alice.id,
      payload: versionOf(versionId, alice.id, 'A 的版本'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    // 甲的版本列表对乙不可见（验收项 A3.2：后端保证，不是仅前端）
    expect(await store.listVersions(bob.id)).toHaveLength(0)
    expect(await store.listVersions(alice.id)).toHaveLength(1)
    expect(await store.getDraft(bob.id)).toBeNull()
    expect((await store.getDraft(alice.id))?.payload.profile.name).toBe('张三')
  })

  it('删版本只删自己的', async () => {
    const alice = await store.createUser({ email: 'alice2@example.com', passwordHash: 'x' })
    const bob = await store.createUser({ email: 'bob2@example.com', passwordHash: 'x' })
    const versionId = randomUUID()
    await store.addVersion({
      id: versionId,
      userId: alice.id,
      payload: versionOf(versionId, alice.id, '版本'),
      createdAt: new Date(),
    })

    // 乙来删甲的版本，删不掉
    await store.deleteVersion(bob.id, versionId)
    expect(await store.listVersions(alice.id)).toHaveLength(1)

    await store.deleteVersion(alice.id, versionId)
    expect(await store.listVersions(alice.id)).toHaveLength(0)
  })

  it('版本列表按生成时间倒序', async () => {
    const user = await store.createUser({ email: 'order@example.com', passwordHash: 'x' })
    const oldId = randomUUID()
    const newId = randomUUID()
    await store.addVersion({
      id: oldId,
      userId: user.id,
      payload: versionOf(oldId, user.id, '旧的'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    await store.addVersion({
      id: newId,
      userId: user.id,
      payload: versionOf(newId, user.id, '新的'),
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    })

    const listed = await store.listVersions(user.id)
    expect(listed.map((row) => row.id)).toEqual([newId, oldId])
  })
})
