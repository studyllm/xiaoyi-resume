import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { Draft, ResumeVersion } from '@xiaoyi/shared/domain/types'

import type { VerificationTokenKind } from './schema'
import * as schema from './schema'
import { drafts, sessions, users, verificationTokens, versions } from './schema'

/** Postgres 数据库句柄。 */
export type PostgresDatabase = NodePgDatabase<typeof schema>

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

/**
 * 密码哈希。
 *
 * 用 Node 自带的 scrypt——内存硬、无需额外依赖。格式是 `scrypt$<salt>$<hash>`，
 * 两者都是 base64。校验时重算并**定长比较**，不靠字符串相等。
 */
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'base64')
  const expected = Buffer.from(parts[2]!, 'base64')
  const derived = await scrypt(password, salt, expected.length)
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/**
 * 令牌只存哈希：本体只在邮件链接里出现一次。
 *
 * 令牌是高熵随机串，不是人选的密码——用 SHA-256 就够，不需要内存硬。
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface StoredUser {
  id: string
  email: string
  passwordHash: string
  emailVerifiedAt: Date | null
  createdAt: Date
}

export interface StoredSession {
  id: string
  userId: string
  createdAt: Date
  expiresAt: Date
}

export interface StoredVerificationToken {
  id: string
  userId: string
  kind: VerificationTokenKind
  tokenHash: string
  createdAt: Date
  expiresAt: Date
}

/**
 * 账号与会话的存取。
 *
 * 做成接口而不是直接写 SQL：测试用内存实现，生产用 Postgres 实现，
 * 两者行为必须一致（`server/src/db/store.spec.ts` 断言的就是这套语义）。
 */
export interface Store {
  createUser(input: { email: string; passwordHash: string }): Promise<StoredUser>
  findUserByEmail(email: string): Promise<StoredUser | null>
  findUserById(id: string): Promise<StoredUser | null>
  markEmailVerified(userId: string): Promise<void>
  /** 删账号。发验证邮件失败时用来回滚——不留一个用户激活不了的账号。 */
  deleteUser(userId: string): Promise<void>
  setPasswordHash(userId: string, passwordHash: string): Promise<void>

  createSession(input: { id: string; userId: string; expiresAt: Date }): Promise<void>
  findSession(id: string): Promise<StoredSession | null>
  /** 滑动续期：把到期时间往后推。 */
  touchSession(id: string, expiresAt: Date): Promise<void>
  deleteSession(id: string): Promise<void>
  /** 登出全清：删掉这个用户的全部会话。 */
  deleteSessionsOfUser(userId: string): Promise<void>

  createVerificationToken(input: {
    userId: string
    kind: VerificationTokenKind
    tokenHash: string
    expiresAt: Date
  }): Promise<void>
  findVerificationToken(
    kind: VerificationTokenKind,
    tokenHash: string,
  ): Promise<StoredVerificationToken | null>
  deleteVerificationToken(id: string): Promise<void>

  /** 读简历底稿。一账号一份。 */
  getDraft(userId: string): Promise<{ payload: Draft; revision: number; updatedAt: Date } | null>
  /** 保存简历底稿。 */
  saveDraft(input: { userId: string; payload: Draft; revision: number }): Promise<void>
  /** 版本列表，按生成时间倒序。 */
  listVersions(userId: string): Promise<Array<{ id: string; payload: ResumeVersion; createdAt: Date }>>
  /** 存一个版本。 */
  addVersion(input: {
    id: string
    userId: string
    payload: ResumeVersion
    createdAt: Date
  }): Promise<void>
  /** 删版本。 */
  deleteVersion(userId: string, id: string): Promise<void>
}

/** 邮箱规范化：去空白、转小写。登录与注册都用同一套。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** 内存实现。测试用；语义与 Postgres 实现一致。 */
export function createMemoryStore(): Store {
  const userRows = new Map<string, StoredUser>()
  const sessionRows = new Map<string, StoredSession>()
  const tokenRows = new Map<string, StoredVerificationToken>()
  const draftRows = new Map<string, { userId: string; payload: Draft; revision: number; updatedAt: Date }>()
  const versionRows = new Map<
    string,
    { id: string; userId: string; payload: ResumeVersion; createdAt: Date }
  >()

  return {
    async createUser({ email, passwordHash }) {
      const row: StoredUser = {
        id: randomUUID(),
        email: normalizeEmail(email),
        passwordHash,
        emailVerifiedAt: null,
        createdAt: new Date(),
      }
      userRows.set(row.id, row)
      return row
    },
    async findUserByEmail(email) {
      const target = normalizeEmail(email)
      for (const row of userRows.values()) {
        if (row.email === target) return row
      }
      return null
    },
    async findUserById(id) {
      return userRows.get(id) ?? null
    },
    async markEmailVerified(userId) {
      const row = userRows.get(userId)
      if (row) row.emailVerifiedAt = new Date()
    },
    async deleteUser(userId) {
      userRows.delete(userId)
      for (const [id, row] of sessionRows) {
        if (row.userId === userId) sessionRows.delete(id)
      }
      for (const [id, row] of tokenRows) {
        if (row.userId === userId) tokenRows.delete(id)
      }
    },
    async setPasswordHash(userId, passwordHash) {
      const row = userRows.get(userId)
      if (row) row.passwordHash = passwordHash
    },

    async createSession({ id, userId, expiresAt }) {
      sessionRows.set(id, { id, userId, createdAt: new Date(), expiresAt })
    },
    async findSession(id) {
      return sessionRows.get(id) ?? null
    },
    async touchSession(id, expiresAt) {
      const row = sessionRows.get(id)
      if (row) row.expiresAt = expiresAt
    },
    async deleteSession(id) {
      sessionRows.delete(id)
    },
    async deleteSessionsOfUser(userId) {
      for (const [id, row] of sessionRows) {
        if (row.userId === userId) sessionRows.delete(id)
      }
    },

    async createVerificationToken({ userId, kind, tokenHash, expiresAt }) {
      const row: StoredVerificationToken = {
        id: randomUUID(),
        userId,
        kind,
        tokenHash,
        createdAt: new Date(),
        expiresAt,
      }
      tokenRows.set(row.id, row)
    },
    async findVerificationToken(kind, tokenHash) {
      for (const row of tokenRows.values()) {
        if (row.kind === kind && row.tokenHash === tokenHash) return row
      }
      return null
    },
    async deleteVerificationToken(id) {
      tokenRows.delete(id)
    },

    async getDraft(userId) {
      return draftRows.get(userId) ?? null
    },
    async saveDraft({ userId, payload, revision }) {
      draftRows.set(userId, { userId, payload, revision, updatedAt: new Date() })
    },
    async listVersions(userId) {
      return [...versionRows.values()]
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    },
    async addVersion({ id, userId, payload, createdAt }) {
      versionRows.set(id, { id, userId, payload, createdAt })
    },
    async deleteVersion(userId, id) {
      const row = versionRows.get(id)
      if (row?.userId === userId) versionRows.delete(id)
    },
  }
}

/** Postgres 实现。 */
export function createPostgresStore(db: PostgresDatabase): Store {
  return {
    async createUser({ email, passwordHash }) {
      const row: StoredUser = {
        id: randomUUID(),
        email: normalizeEmail(email),
        passwordHash,
        emailVerifiedAt: null,
        createdAt: new Date(),
      }
      await db.insert(users).values(row)
      return row
    },
    async findUserByEmail(email) {
      const rows = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1)
      return rows[0] ?? null
    },
    async findUserById(id) {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
      return rows[0] ?? null
    },
    async markEmailVerified(userId) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, userId))
    },
    async deleteUser(userId) {
      await db.delete(users).where(eq(users.id, userId))
    },
    async setPasswordHash(userId, passwordHash) {
      await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
    },

    async createSession({ id, userId, expiresAt }) {
      await db.insert(sessions).values({ id, userId, expiresAt, createdAt: new Date() })
    },
    async findSession(id) {
      const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
      return rows[0] ?? null
    },
    async touchSession(id, expiresAt) {
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
    },
    async deleteSession(id) {
      await db.delete(sessions).where(eq(sessions.id, id))
    },
    async deleteSessionsOfUser(userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId))
    },

    async createVerificationToken({ userId, kind, tokenHash, expiresAt }) {
      await db.insert(verificationTokens).values({
        id: randomUUID(),
        userId,
        kind,
        tokenHash,
        expiresAt,
        createdAt: new Date(),
      })
    },
    async findVerificationToken(kind, tokenHash) {
      const rows = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.kind, kind),
            eq(verificationTokens.tokenHash, tokenHash),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    },
    async deleteVerificationToken(id) {
      await db.delete(verificationTokens).where(eq(verificationTokens.id, id))
    },

    async getDraft(userId) {
      const rows = await db.select().from(drafts).where(eq(drafts.userId, userId)).limit(1)
      const row = rows[0]
      return row ? { ...row, payload: row.payload as Draft } : null
    },
    async saveDraft({ userId, payload, revision }) {
      await db
        .insert(drafts)
        .values({ userId, payload, revision, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: drafts.userId,
          set: { payload, revision, updatedAt: new Date() },
        })
    },
    async listVersions(userId) {
      const rows = await db
        .select()
        .from(versions)
        .where(eq(versions.userId, userId))
        .orderBy(desc(versions.createdAt))
      return rows.map((row) => ({ ...row, payload: row.payload as ResumeVersion }))
    },
    async addVersion({ id, userId, payload, createdAt }) {
      await db.insert(versions).values({ id, userId, payload, createdAt })
    },
    async deleteVersion(userId, id) {
      await db
        .delete(versions)
        .where(and(eq(versions.id, id), eq(versions.userId, userId)))
    },
  }
}
