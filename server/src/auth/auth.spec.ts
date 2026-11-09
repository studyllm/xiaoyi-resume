import { rulesGenerator } from '@xiaoyi/shared/engines/generator'

import { describe, expect, it } from 'vitest'

import { createMemoryMailer } from './mailer'
import { buildApp } from '../app'
import { createMemoryIdempotencyStore } from '../db/idempotency'
import { createMemoryStore } from '../db/store'

const PASSWORD = 'correct horse battery'

interface Harness {
  app: ReturnType<typeof buildApp>
  mailer: ReturnType<typeof createMemoryMailer>
  store: ReturnType<typeof createMemoryStore>
}

function harness(): Harness {
  const mailer = createMemoryMailer()
  const store = createMemoryStore()
  const app = buildApp({
    generator: rulesGenerator,
    llm: null,
    store,
    idempotency: createMemoryIdempotencyStore(),
    mailer,
    siteUrl: 'http://localhost:5173',
    from: 'noreply@xiaoyi.example',
  })
  return { app, mailer, store }
}

/** 从验证邮件里取出令牌。 */
function tokenFromMail(mailer: Harness['mailer']): string {
  const mail = mailer.sent[0]
  expect(mail).toBeDefined()
  const match = /token=([^\s&]+)/.exec(mail!.text)
  expect(match).not.toBeNull()
  return decodeURIComponent(match![1]!)
}

describe('注册与验证', () => {
  it('注册后发验证邮件，且不建立登录态', async () => {
    const { app, mailer } = harness()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD },
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
    const payload = { email: 'someone@example.com', password: PASSWORD }

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
      payload: { email: 'someone@example.com', password: PASSWORD },
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
      payload: { email: 'someone@example.com', password: PASSWORD },
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
  async function registerAndVerify(h: Harness): Promise<void> {
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: tokenFromMail(h.mailer) },
    })
  }

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
      payload: { email: 'someone@example.com', password: PASSWORD },
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
      payload: { email: 'someone@example.com', password: PASSWORD },
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
      payload: { email: 'someone@example.com', password: PASSWORD },
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
      payload: { email: 'someone@example.com', password: PASSWORD },
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
