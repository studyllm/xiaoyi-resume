import nodemailer from 'nodemailer'

import type { MailSender, OutgoingMail } from './mailer'

export interface SmtpConfig {
  host: string
  port: number
  /** 发信账号。 */
  user: string
  /** 授权码——不是登录密码。 */
  pass: string
  /** 发信人地址。 */
  from: string
  /** 是否启用 TLS。生产环境为真。 */
  secure: boolean
}

/**
 * SMTP 发信。
 *
 * 走 SMTP 而不是各家 SDK：阿里云邮件推送提供 SMTP 入口，
 * 用标准协议就换服务商时不用改代码（ADR-0002 §6）。
 */
export function createSmtpMailer(config: SmtpConfig): MailSender {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  })

  return {
    async send(mail: OutgoingMail) {
      await transport.sendMail({
        from: config.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      })
    },
  }
}
