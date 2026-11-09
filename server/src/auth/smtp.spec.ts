import { describe, expect, it } from 'vitest'

import type { MailSender } from './mailer'
import { checkSmtp, checkSmtpConfig, describeSmtpFailure } from './smtp'
import type { SmtpConfig } from './smtp'

function config(overrides: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    host: 'smtp.example.com',
    port: 465,
    user: 'someone@example.com',
    pass: '授权码',
    from: 'noreply@example.com',
    secure: true,
    ...overrides,
  }
}

/** 造一个像 nodemailer 那样的 SMTP 错误：带 command 与 responseCode。 */
function smtpError(fields: { code?: string; command?: string; responseCode?: number; message?: string }) {
  return Object.assign(new Error(fields.message ?? 'failed'), fields)
}

describe('SMTP 配置自检', () => {
  it('465 端口必须配隐式 TLS', () => {
    expect(() => checkSmtpConfig(config({ port: 465, secure: false }))).toThrow(/465/)
  })

  it('隐式 TLS 配在 465 上时通过', () => {
    expect(() => checkSmtpConfig(config({ port: 465, secure: true }))).not.toThrow()
  })

  it('明文端口不受这条约束', () => {
    // 本地 Mailpit：1025 明文，不该被拦住
    expect(() => checkSmtpConfig(config({ port: 1025, secure: false }))).not.toThrow()
  })
})

describe('SMTP 失败分类', () => {
  it('认证这一步被拒说清是授权码的事', () => {
    const failure = describeSmtpFailure(
      smtpError({
        code: 'EAUTH',
        command: 'AUTH PLAIN',
        responseCode: 526,
        message: 'Invalid login: 526 Authentication failure[0]',
      }),
    )

    expect(failure.kind).toBe('auth')
    expect(failure.reason).toContain('认证')
    expect(failure.hint).toContain('授权码')
  })

  it('连不上说清是网络或端口的事', () => {
    const failure = describeSmtpFailure(
      smtpError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:1025' }),
    )

    expect(failure.kind).toBe('connect')
    expect(failure.hint).toContain('465')
  })

  it('认不出来的失败保留原始消息', () => {
    const failure = describeSmtpFailure(new Error(' something odd '))

    expect(failure.kind).toBe('unknown')
    expect(failure.hint).toContain('something odd')
  })
})

describe('启动时自检', () => {
  function mailerThatFails(error: unknown): MailSender {
    return {
      async send() {},
      async verify() {
        throw error
      },
    }
  }

  it('能登录时通过', async () => {
    const result = await checkSmtp({
      async send() {},
      async verify() {},
    })

    expect(result.ok).toBe(true)
    expect(result.failure).toBeNull()
  })

  it('认证被拒时给出原因与下一步', async () => {
    const result = await checkSmtp(
      mailerThatFails(
        smtpError({ code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 526 }),
      ),
    )

    expect(result.ok).toBe(false)
    expect(result.failure!.kind).toBe('auth')
    expect(result.failure!.hint).toContain('授权码')
  })
})
