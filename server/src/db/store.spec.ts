import { describe, expect, it } from 'vitest'

import { migrateMany, migrateOne } from './migrate'
import {
  createMemoryStore,
  hashPassword,
  hashToken,
  normalizeEmail,
  verifyPassword,
} from './store'

describe('账号存储', () => {
  it('密码哈希每次都不一样，但都能校验通过', async () => {
    const first = await hashPassword('correct horse')
    const second = await hashPassword('correct horse')

    expect(first).not.toBe(second)
    expect(await verifyPassword('correct horse', first)).toBe(true)
    expect(await verifyPassword('correct horse', second)).toBe(true)
    expect(await verifyPassword('wrong horse', first)).toBe(false)
  })

  it('存的不是明文', async () => {
    const stored = await hashPassword('correct horse')
    expect(stored).not.toContain('correct horse')
  })

  it('邮箱规范化后大小写与空白不影响查找', async () => {
    expect(normalizeEmail('  Someone@Example.COM ')).toBe('someone@example.com')

    const store = createMemoryStore()
    const user = await store.createUser({
      email: 'Someone@Example.COM',
      passwordHash: 'x',
    })
    expect(user.email).toBe('someone@example.com')
    expect(await store.findUserByEmail('someone@example.com')).not.toBeNull()
    expect(await store.findUserByEmail('SOMEONE@example.com')).not.toBeNull()
  })

  it('账号之间互相看不见', async () => {
    const store = createMemoryStore()
    const alice = await store.createUser({ email: 'alice@example.com', passwordHash: 'x' })
    const bob = await store.createUser({ email: 'bob@example.com', passwordHash: 'x' })

    await store.createSession({ id: 's-alice', userId: alice.id, expiresAt: new Date() })
    await store.createSession({ id: 's-bob', userId: bob.id, expiresAt: new Date() })

    // 登出全清只清自己的
    await store.deleteSessionsOfUser(alice.id)

    expect(await store.findSession('s-alice')).toBeNull()
    expect(await store.findSession('s-bob')).not.toBeNull()
  })

  it('令牌只存哈希，明文查不到', async () => {
    const store = createMemoryStore()
    const user = await store.createUser({ email: 'a@example.com', passwordHash: 'x' })
    const token = 'plain-token-value'

    await store.createVerificationToken({
      userId: user.id,
      kind: 'verify-email',
      tokenHash: hashToken(token),
      expiresAt: new Date(),
    })

    expect(await store.findVerificationToken('verify-email', token)).toBeNull()
    expect(await store.findVerificationToken('verify-email', hashToken(token))).not.toBeNull()
    // 令牌是一次性的：验证过就删掉
    const found = await store.findVerificationToken('verify-email', hashToken(token))
    await store.deleteVerificationToken(found!.id)
    expect(await store.findVerificationToken('verify-email', hashToken(token))).toBeNull()
  })
})

describe('存量数据迁移', () => {
  const steps = [
    {
      version: 2,
      migrate(value: unknown) {
        const raw = value as { name?: string }
        if (!raw || typeof raw.name !== 'string') throw new Error('旧版结构无法识别')
        return { name: raw.name, title: '补上的抬头' }
      },
    },
  ]

  it('一份失败不白屏：丢掉那一份，其余照常', () => {
    const result = migrateMany<{ name: string; title: string }>(
      [
        { key: 'draft', raw: { name: '张三' } },
        { key: 'version-1', raw: { broken: true } },
        { key: 'version-2', raw: { name: '李四' } },
      ],
      () => steps,
    )

    expect(result.migrated).toHaveLength(2)
    expect(result.migrated.map((item) => item.name)).toEqual(['张三', '李四'])
    expect(result.discarded).toHaveLength(1)
    expect(result.discarded[0]!.key).toBe('version-1')
    expect(result.discarded[0]!.reason).toContain('旧版结构无法识别')
  })

  it('迁移失败返回丢弃而不是抛异常', () => {
    const result = migrateOne({ broken: true }, steps)
    expect(result.discarded).toBe(true)
    expect(result.value).toBeNull()
  })
})
