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

/**
 * 生成日志。审计与算钱靠它（ADR-0005 §5）。
 *
 * **不复制简历正文**：输入用底稿的修订号引用。存的是模型自己的输出——
 * 不然「这次生成了什么」无从谈起。
 */
export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** 这一版正文是谁写的 */
    engine: text('engine').notNull(),
    /** 模型 id。没配供应商时为空 */
    model: text('model'),
    /** 提示词版本。变了就换号，用来区分两批输出 */
    promptVersion: text('prompt_version'),
    /** 生成时的底稿修订号——输入用引用 */
    draftRevision: integer('draft_revision'),
    /** JD 的哈希，用来判断是不是同一份 JD */
    jdHash: text('jd_hash'),
    /** ok（模型可用）/ degraded（有回退）/ error（模型不可用） */
    status: text('status').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    /** 模型写了几条要点 */
    claims: integer('claims').notNull().default(0),
    /** 有多少条没采用模型的产出 */
    reverted: integer('reverted').notNull().default(0),
    /** 模型的原始输出 */
    rawOutput: text('raw_output'),
    /** 模型不可用时的原因 */
    error: text('error'),
  },
  (table) => [index('generations_user_idx').on(table.userId, table.createdAt)],
)

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type VerificationTokenRow = typeof verificationTokens.$inferSelect
