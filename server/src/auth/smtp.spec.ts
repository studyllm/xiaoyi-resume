import { describe, expect, it } from 'vitest'

import { checkSmtpConfig } from './smtp'
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
