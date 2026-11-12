import { timingSafeEqual } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { hashPassword, hashToken, normalizeEmail, verifyPassword } from '../db/store'
import type { Store } from '../db/store'
import { sendError } from '../http/errors'
import { errorDetail } from '../http/logger'
import { describeSmtpFailure } from '../auth/smtp'
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
    const body = request.body as { email?: unknown; password?: unknown; consent?: unknown }

    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      return sendError(reply, 'VALIDATION_FAILED')
    }
    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return sendError(reply, 'VALIDATION_FAILED')
    }
    // 同意是把简历内容发给模型供应商的前提。没勾就是没同意——
    // 界面必须让用户单独勾这一项（`docs/privacy-conclusions.md` §7）。
    if (body.consent !== true) {
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
    await store.recordModelConsent(user.id)

    // 令牌本体只在邮件链接里出现一次，库里只存哈希
    const token = randomToken()
    await store.createVerificationToken({
      userId: user.id,
      kind: 'verify-email',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    })
    try {
      await mailer.send(verificationMail(mailConfig, user.email, token))
    } catch (error) {
      // 邮件没发出去就把账号删掉——留一个用户激活不了的账号，
      // 用户重试还会撞上「邮箱已注册」。
      // 失败原因只进日志：用户看到的是「验证邮件没发出去」，排查靠这条日志。
      // 日志里说清是哪一类失败、失败在哪一步、下一步做什么。
      const failure = describeSmtpFailure(error)
      request.log.error(
        { requestId: request.id, err: errorDetail(error), failure },
        '验证邮件发送失败',
      )
      await store.deleteUser(user.id)
      return sendError(reply, 'EMAIL_SEND_FAILED')
    }

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
      try {
        await mailer.send(passwordResetMail(mailConfig, user.email, token))
      } catch (error) {
        // 无论邮箱存不存在都返回 204（提示不同等于泄露账号注册过），
        // 发信失败也不例外。失败原因只进日志。
        const failure = describeSmtpFailure(error)
        request.log.error(
          { requestId: request.id, err: errorDetail(error), failure },
          '重置邮件发送失败',
        )
      }
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

  /**
   * 建一个演示账号。
   *
   * 落地页的「用示例简历试一遍」需要一个账号才能存简历、生成版本。这里现建一个
   * 临时的：邮箱用保留域名 `.local`（不可能是真邮箱），不发验证邮件直接算已验证。
   *
   * 演示账号的垃圾数据由定时任务清掉——`docs/ops/runbook.md`（P5）里有那一条。
   */
  app.post('/api/v1/auth/demo', async (_request, reply) => {
    const email = `demo-${randomToken().slice(0, 12).toLowerCase()}@xiaoyi.local`
    const user = await store.createUser({
      email,
      passwordHash: await hashPassword(randomToken()),
    })
    await store.markEmailVerified(user.id)
    // 演示账号里全是假数据，发给模型供应商没有隐私风险——
    // 与其让演示路径走不通，不如直接记为已同意。
    await store.recordModelConsent(user.id)
    await createSession(store, user.id, reply)

    return reply.code(201).send({
      user: { id: user.id, email: user.email },
      verificationRequired: false,
    })
  })

  app.get('/api/v1/me', async (request, reply) => {
    const user = await currentUser(store, request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')
    return {
      user: { id: user.id, email: user.email },
      // 这个账号有没有同意把简历内容发给模型供应商。没有就是没同意。
      modelConsentAt: await store.modelConsentAt(user.id),
    }
  })

  /**
   * 补记同意。
   *
   * 老账号没有同意记录时，用户在界面上打开「本次用模型」会走到这里——
   * **那一刻就是他的点头**。
   */
  app.post('/api/v1/me/model-consent', async (request, reply) => {
    const user = await currentUser(store, request)
    if (!user) return sendError(reply, 'AUTH_REQUIRED')
    await store.recordModelConsent(user.id)
    return { modelConsentAt: await store.modelConsentAt(user.id) }
  })
}
