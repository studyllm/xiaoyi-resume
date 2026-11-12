import { rulesGenerator } from '@xiaoyi/shared/engines/generator'
import { rulesJdAnalyzer } from '@xiaoyi/shared/engines/jdAnalysis'
import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import type { FastifyLoggerOptions } from 'fastify'

import { createMemoryMailer } from './mailer'
import type { MailSender, OutgoingMail } from './mailer'
import { buildApp } from '../app'
import { createMemoryIdempotencyStore } from '../db/idempotency'
import { createMemoryStore } from '../db/store'

const PASSWORD = 'correct horse battery'

interface Harness {
  app: ReturnType<typeof buildApp>
  mailer: MailSender & { sent: OutgoingMail[] }
  store: ReturnType<typeof createMemoryStore>
}

function harness(
  options: { mailer?: MailSender & { sent: OutgoingMail[] }; log?: boolean | FastifyLoggerOptions } = {},
): Harness {
  const mailer = options.mailer ?? createMemoryMailer()
  const store = createMemoryStore()
  const app = buildApp({
    generator: rulesGenerator,
    analyzer: rulesJdAnalyzer,
    llm: null,
    store,
    idempotency: createMemoryIdempotencyStore(),
    mailer,
    siteUrl: 'http://localhost:5173',
    from: 'noreply@xiaoyi.example',
    ...(options.log === undefined ? {} : { log: options.log }),
  })
  return { app, mailer, store }
}

/**
 * 平时发得出去，出错时才失败——用来测「发信失败时」的行为。
 *
 * 失败模拟 SMTP 连不上：这类错误对象上带着机器可读的 `code`。
 */
function switchableMailer() {
  const sent: OutgoingMail[] = []
  let failing = false
  let refusingAuth = false
  const refuse = (): never => {
    if (refusingAuth) {
      const error = new Error('Invalid login: 526 Authentication failure[0]') as Error & {
        code?: string
        command?: string
        responseCode?: number
      }
      error.code = 'EAUTH'
      error.command = 'AUTH PLAIN'
      error.responseCode = 526
      throw error
    }
    const error = new Error('connect ECONNREFUSED 127.0.0.1:1025') as Error & { code?: string }
    error.code = 'ECONNREFUSED'
    throw error
  }
  return {
    sent,
    fail(): void {
      failing = true
    },
    /** 让发信以「认证被拒」失败——真实服务商最常见的那个错。 */
    refuseAuth(): void {
      failing = true
      refusingAuth = true
    },
    async send(mail: OutgoingMail): Promise<void> {
      sent.push(mail)
      if (failing) refuse()
    },
    async verify(): Promise<void> {
      if (failing) refuse()
    },
  }
}

/** 把日志输出接到自己的流上，好断言日志里有什么。 */
function capturingLogger(): { options: FastifyLoggerOptions; lines: string[] } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
  return { options: { level: 'error', stream }, lines }
}

/** 从验证邮件里取出令牌。 */
function tokenFromMail(mailer: Harness['mailer']): string {
  const mail = mailer.sent[0]
  expect(mail).toBeDefined()
  const match = /token=([^\s&]+)/.exec(mail!.text)
  expect(match).not.toBeNull()
  return decodeURIComponent(match![1]!)
}

/** 注册并验证邮箱——之后这个账号可以登录。 */
async function registerAndVerify(h: Harness): Promise<void> {
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
  })
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: { token: tokenFromMail(h.mailer) },
  })
}

describe('注册与验证', () => {
  it('注册后发验证邮件，且不建立登录态', async () => {
    const { app, mailer } = harness()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      email: 'someone@example.com',
      verificationRequired: true,
    })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]!.to).toBe('someone@example.com')
    // 注册响应里没有 set-cookie——邮箱没验证前不能登录
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('邮箱已注册时给出可执行的下一步', async () => {
    const { app } = harness()
    const payload = { email: 'someone@example.com', password: PASSWORD, consent: true }

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })
    const again = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })

    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('EMAIL_TAKEN')
  })

  it('验证邮箱后建立登录态', async () => {
    const { app, mailer } = harness()

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromMail(mailer) },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['set-cookie']).toContain('session=')
  })

  it('令牌只能用一次', async () => {
    const { app, mailer } = harness()

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })
    const token = tokenFromMail(mailer)

    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } }))
        .statusCode,
    ).toBe(204)
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token },
    })

    expect(second.statusCode).toBe(400)
    expect(second.json().error.code).toBe('INVALID_RESET_TOKEN')
  })
})

describe('登录', () => {
  it('用邮箱与密码登录', async () => {
    const h = harness()
    await registerAndVerify(h)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().user.email).toBe('someone@example.com')
    expect(response.headers['set-cookie']).toContain('session=')
  })

  it('邮箱没验证时不能登录', async () => {
    const h = harness()
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('凭据不对回 403，不占用 401', async () => {
    const h = harness()
    await registerAndVerify(h)

    const noSuchEmail = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: PASSWORD },
    })
    const wrongPassword = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: 'wrong password' },
    })

    expect(noSuchEmail.statusCode).toBe(403)
    expect(wrongPassword.statusCode).toBe(403)
    expect(noSuchEmail.json()).toEqual(wrongPassword.json())
  })

  it('会话 cookie 是 httpOnly 的', async () => {
    const h = harness()
    await registerAndVerify(h)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })

    const cookie = String(response.headers['set-cookie'])
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })
})

describe('登出', () => {
  it('登出后这个会话不再有效', async () => {
    const h = harness()
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromMail(h.mailer) },
    })
    const login = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })
    const cookie = login.cookies[0]!

    expect((await h.app.inject({ method: 'GET', url: '/api/v1/me', cookies: { session: cookie.value } })).statusCode).toBe(200)

    await h.app.inject({ method: 'POST', url: '/api/v1/auth/logout', cookies: { session: cookie.value } })

    const after = await h.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { session: cookie.value },
    })
    expect(after.statusCode).toBe(401)
    expect(after.json().error.code).toBe('AUTH_REQUIRED')
  })

  it('登出全清把其它会话也清掉', async () => {
    const h = harness()
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromMail(h.mailer) },
    })

    const first = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })
    const second = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      cookies: { session: first.cookies[0]!.value },
    })

    const after = await h.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { session: second.cookies[0]!.value },
    })
    expect(after.statusCode).toBe(401)
  })
})

describe('找回密码', () => {
  it('邮箱不存在时也返回成功，不泄露账号注册过', async () => {
    const h = harness()

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      payload: { email: 'nobody@example.com' },
    })

    expect(response.statusCode).toBe(204)
    expect(h.mailer.sent).toHaveLength(0)
  })

  it('重置密码后旧密码失效、新密码可用，且原有会话全部失效', async () => {
    const h = harness()
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromMail(h.mailer) },
    })
    const login = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })
    const sessionCookie = login.cookies[0]!.value

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      payload: { email: 'someone@example.com' },
    })
    const resetToken = /token=([^\s&]+)/.exec(h.mailer.sent[1]!.text)![1]!

    const reset = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: decodeURIComponent(resetToken), newPassword: 'a whole new password' },
    })
    expect(reset.statusCode).toBe(204)

    const oldPassword = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })
    expect(oldPassword.statusCode).toBe(403)

    const newPassword = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'someone@example.com', password: 'a whole new password' },
    })
    expect(newPassword.statusCode).toBe(200)

    // 重置后原有会话失效
    const after = await h.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { session: sessionCookie },
    })
    expect(after.statusCode).toBe(401)
  })
})

describe('发信失败', () => {
  it('注册发信失败时，日志里说得出原因', async () => {
    const { options, lines } = capturingLogger()
    const mailer = switchableMailer()
    mailer.fail()
    const h = harness({ mailer, log: options })

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json().error.code).toBe('EMAIL_SEND_FAILED')

    const log = lines.join('')
    expect(log).toContain('验证邮件发送失败')
    expect(log).toContain('ECONNREFUSED')
    expect(log).toContain('127.0.0.1:1025')
    // 说清是哪一类失败、下一步做什么
    expect(log).toContain('连不上 SMTP')
  })

  it('注册发信被拒时，日志里说得出是授权码的事', async () => {
    const { options, lines } = capturingLogger()
    const mailer = switchableMailer()
    mailer.refuseAuth()
    const h = harness({ mailer, log: options })

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    const log = lines.join('')
    expect(log).toContain('SMTP 认证被拒')
    expect(log).toContain('授权码')
    // 失败发生在哪一步与 SMTP 状态码也在日志里
    expect(log).toContain('AUTH PLAIN')
    expect(log).toContain('526')
  })

  it('注册发信失败时，账号被删掉——重试不会撞上「邮箱已注册」', async () => {
    const { options } = capturingLogger()
    const mailer = switchableMailer()
    mailer.fail()
    const h = harness({ mailer, log: options })

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    expect(await h.store.findUserByEmail('someone@example.com')).toBeNull()
  })

  it('日志里不出现令牌与收件邮箱', async () => {
    const { options, lines } = capturingLogger()
    const mailer = switchableMailer()
    mailer.fail()
    const h = harness({ mailer, log: options })

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    const token = /token=([^\s&]+)/.exec(h.mailer.sent[0]!.text)![1]!
    const log = lines.join('')
    expect(log).not.toContain('someone@example.com')
    expect(log).not.toContain(token)
  })

  it('找回密码发信失败时仍返回 204，原因进日志', async () => {
    const { options, lines } = capturingLogger()
    const mailer = switchableMailer()
    const h = harness({ mailer, log: options })
    await registerAndVerify(h)
    mailer.fail()

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      payload: { email: 'someone@example.com' },
    })

    expect(response.statusCode).toBe(204)
    const log = lines.join('')
    expect(log).toContain('重置邮件发送失败')
    expect(log).toContain('ECONNREFUSED')
  })

  it('发信失败也不暴露邮箱是否存在', async () => {
    const { options } = capturingLogger()
    const mailer = switchableMailer()
    const h = harness({ mailer, log: options })
    await registerAndVerify(h)
    mailer.fail()

    const registered = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      payload: { email: 'someone@example.com' },
    })
    const unknown = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset',
      payload: { email: 'nobody@example.com' },
    })

    expect(registered.statusCode).toBe(204)
    expect(unknown.statusCode).toBe(204)
    expect(registered.body).toEqual(unknown.body)
  })
})
