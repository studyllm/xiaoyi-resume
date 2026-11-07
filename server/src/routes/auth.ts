import { timingSafeEqual } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { hashPassword, hashToken, normalizeEmail, verifyPassword } from '../db/store'
import type { Store } from '../db/store'
import { sendError } from '../http/errors'
import {
  TOKEN_TTL_MS,
  clearSessionCookie,
  createSession,
  currentUser,
  randomToken,
} from '../auth/session'
import type { MailSender } from '../auth/mailer'
import { passwordResetMail, verificationMail } from '../auth/mailer'

/** 密码最短长度。再长只会让用户记不住。 */
const MIN_PASSWORD_LENGTH = 8

export interface AuthDeps {
  store: Store
  mailer: MailSender
  /** 站点对外地址，验证与重置链接指向它。 */
  siteUrl: string
  /** 发信人地址。 */
  from: string
}

/** 定长比较令牌哈希，避免时序侧信道。 */
function tokenMatches(token: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashToken(token), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * 鉴权端点。
 *
 * 语义按 ADR-0002：邮箱 + 密码，未验证不能登录，找回密码只重置不找回，
 * 登录失败不区分「邮箱不存在」与「密码不对」。
 */
export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { store, mailer } = deps
  const mailConfig = { siteUrl: deps.siteUrl, from: deps.from }

  app.post('/api/v1/auth/register', async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown }

    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      return sendError(reply, 'VALIDATION_FAILED')
    }
    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return sendError(reply, 'VALIDATION_FAILED')
    }

    const email = normalizeEmail(body.email)
    if (await store.findUserByEmail(email)) {
      return sendError(reply, 'EMAIL_TAKEN')
    }

    const user = await store.createUser({
      email,
      passwordHash: await hashPassword(body.password),
    })

    // 令牌本体只在邮件链接里出现一次，库里只存哈希
    const token = randomToken()
    await store.createVerificationToken({
      userId: user.id,
      kind: 'verify-email',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    })
    await mailer.send(verificationMail(mailConfig, user.email, token))

    // 注册成功不建立会话——邮箱没验证前不能登录（ADR-0002 §2）
    return reply.code(201).send({ email: user.email, verificationRequired: true })
  })

  app.post('/api/v1/auth/verify-email', async (request, reply) => {
    const body = request.body as { token?: unknown }
    if (typeof body?.token !== 'string') {
      return sendError(reply, 'INVALID_RESET_TOKEN')
    }

    const row = await store.findVerificationToken('verify-email', hashToken(body.token))
    if (!row || row.expiresAt.getTime() <= Date.now() || !tokenMatches(body.token, row.tokenHash)) {
      return sendError(reply, 'INVALID_RESET_TOKEN')
    }

    await store.markEmailVerified(row.userId)
    await store.deleteVerificationToken(row.id)

    // 验证通过就建立会话，省一次登录
    await createSession(store, row.userId, reply)
    return reply.code(204).send()
  })

  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown }
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      return sendError(reply, 'VALIDATION_FAILED')
    }

    const user = await store.findUserByEmail(body.email)
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : false
    if (!user || !ok) {
      // 不区分「邮箱不存在」与「密码不对」——那等于泄露账号注册过
      return sendError(reply, 'INVALID_CREDENTIALS')
    }
    if (!user.emailVerifiedAt) {
      return sendError(reply, 'EMAIL_NOT_VERIFIED')
    }

    await createSession(store, user.id, reply)
    return { user: { id: user.id, email: user.email } }
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies.session
    if (token) await store.deleteSession(hashToken(token))
    clearSessionCookie(reply)
    return reply.code(204).send()
  })

  app.post('/api/v1/auth/logout-all', async (request, reply) => {
    const user = await currentUser(store, request)
    if (user) await store.deleteSessionsOfUser(user.id)
    clearSessionCookie(reply)
    return reply.code(204).send()
  })

  app.post('/api/v1/auth/password-reset', async (request, reply) => {
    const body = request.body as { email?: unknown }
    if (typeof body?.email !== 'string') {
      return sendError(reply, 'VALIDATION_FAILED')
    }

    const user = await store.findUserByEmail(body.email)
    if (user) {
      const token = randomToken()
      await store.createVerificationToken({
        userId: user.id,
        kind: 'reset-password',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      })
      await mailer.send(passwordResetMail(mailConfig, user.email, token))
    }

    // 无论邮箱存不存在都返回 204——提示不同等于泄露账号注册过
    return reply.code(204).send()
  })

  app.post('/api/v1/auth/password-reset/confirm', async (request, reply) => {
    const body = request.body as { token?: unknown; newPassword?: unknown }
    if (typeof body?.token !== 'string' || typeof body?.newPassword !== 'string') {
      return sendError(reply, 'VALIDATION_FAILED')
    }
    if (body.newPassword.length < MIN_PASSWORD_LENGTH) {
      return sendError(reply, 'VALIDATION_FAILED')
    }

    const row = await store.findVerificationToken('reset-password', hashToken(body.token))
    if (!row || row.expiresAt.getTime() <= Date.now() || !tokenMatches(body.token, row.tokenHash)) {
      return sendError(reply, 'INVALID_RESET_TOKEN')
    }

    await store.setPasswordHash(row.userId, await hashPassword(body.newPassword))
    await store.deleteVerificationToken(row.id)
    // 重置后原有会话全部失效
    await store.deleteSessionsOfUser(row.userId)
    clearSessionCookie(reply)

    return reply.code(204).send()
  })

  app.get('/api/v1/me', async (request, reply) => {
    const user = await currentUser(store, request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')
    return { user: { id: user.id, email: user.email } }
  })
}
