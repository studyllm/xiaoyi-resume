import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/**
 * 数据模型。
 *
 * 三个表：账号、会话、验证令牌。简历与版本在 P3 的存储任务里加。
 *
 * **账号标识是服务端签发的 uuid**，不是邮箱也不是「user-名字」——
 * 邮箱会泄露，名字会撞（ADR-0002 §5、F5）。
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    /** 规范化后的小写邮箱。 */
    email: text('email').notNull(),
    /** argon2id 哈希。服务端不存明文，也不存可逆密文。 */
    passwordHash: text('password_hash').notNull(),
    /** 邮箱验证通过的时刻。没验证的账号不能登录，也不能保存。 */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  // 邮箱是登录标识，必须唯一
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
)

/** 会话。登出全清就是删掉某个用户的全部会话。 */
export const sessions = pgTable(
  'sessions',
  {
    /** 会话令牌本身（哈希前）。 */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** 绝对有效期：30 天。 */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
)

export type VerificationTokenKind = 'verify-email' | 'reset-password'

/**
 * 验证与重置令牌。
 *
 * **只存哈希**：令牌本体只在邮件链接里出现一次，服务端拿明文比对哈希。
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<VerificationTokenKind>().notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** 24 小时有效。 */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('verification_tokens_lookup_idx').on(table.kind, table.tokenHash)],
)

/** 简历底稿。一账号一份（计划 T3.7）。 */
export const drafts = pgTable('drafts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 结构化简历，原样存 JSONB——它是树形结构，拆成关系表反而更复杂。 */
  payload: jsonb('payload').notNull(),
  /** 每次保存 +1。客户端带它做乐观并发。 */
  revision: integer('revision').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

/** 版本快照。生成之后不可变，也不随底稿改动而回写。 */
export const versions = pgTable(
  'versions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('versions_user_idx').on(table.userId, table.createdAt)],
)

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type VerificationTokenRow = typeof verificationTokens.$inferSelect
