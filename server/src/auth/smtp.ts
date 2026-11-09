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
 * SMTP 配置的自检。
 *
 * 端口与加密方式不匹配是最常见的一种「半套配置」：**465 是隐式 TLS 端口**，
 * 用明文去连它，对面会直接掐断连接，报出来的是「Connection closed
 * unexpectedly」——看不出是哪配错了。宁可起不来，也不要让人对着那句话猜
 * （`docs/ops/runbook.md` §1.1：带着半套配置跑起来的服务端比不启动更糟）。
 *
 * 只查这一条：它是标准端口（RFC 8314），没有歧义。别的端口用哪种加密由
 * 服务商说了算，服务端不替它猜。
 */
export function checkSmtpConfig(config: SmtpConfig): void {
  if (config.port === 465 && !config.secure) {
    throw new Error('SMTP 端口 465 是隐式 TLS 端口，SMTP_SECURE 必须是 true')
  }
}

/** SMTP 失败的三类：认证被拒、连不上、其它。 */
export type SmtpFailureKind = 'auth' | 'connect' | 'unknown'

export interface SmtpFailure {
  kind: SmtpFailureKind
  /** 一句话说清是什么问题。 */
  reason: string
  /** 下一步做什么。 */
  hint: string
}

/**
 * 把 SMTP 失败翻译成「是什么问题」与「下一步做什么」。
 *
 * nodemailer 的错误对象里有三样决定性的东西：`command`（失败在**哪一步**——
 * `AUTH PLAIN` 就是认证这一步）、`responseCode`（SMTP 状态码，526、535）与
 * `code`（`EAUTH`、`ECONNREFUSED`）。光看 message 只知道「认证失败」；看了
 * 这三样才知道是**认证被拒**——那是授权码不对，不是网络问题。
 */
export function describeSmtpFailure(error: unknown): SmtpFailure {
  const extra = (error ?? {}) as {
    code?: unknown
    command?: unknown
    responseCode?: unknown
    message?: unknown
  }
  const code = typeof extra.code === 'string' ? extra.code : ''
  const command = typeof extra.command === 'string' ? extra.command : ''
  const responseCode = typeof extra.responseCode === 'number' ? extra.responseCode : 0
  const message = typeof extra.message === 'string' ? extra.message : String(error)

  if (
    code === 'EAUTH' ||
    command === 'AUTH PLAIN' ||
    command === 'AUTH LOGIN' ||
    responseCode === 526 ||
    responseCode === 535
  ) {
    return {
      kind: 'auth',
      reason: 'SMTP 认证被拒',
      hint: 'SMTP_USER 与 SMTP_PASS 不对。服务商要的是**授权码**，不是登录密码；SMTP_USER 也要用服务商那边的发信账号。',
    }
  }

  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'ECONNECTION'
  ) {
    return {
      kind: 'connect',
      reason: '连不上 SMTP',
      hint: '先核对启动输出里的发信目标：465 是隐式 TLS 端口（要 SMTP_SECURE=true），587 用明文连。本地是 Mailpit 的话要先 `npm run db:mail`。',
    }
  }

  return { kind: 'unknown', reason: '发信失败', hint: `原始错误：${message}` }
}

export interface SmtpCheckResult {
  ok: boolean
  /** 失败时的原因与下一步；成功时是 null。 */
  failure: SmtpFailure | null
}

/**
 * 拿配置的凭据登录一次 SMTP，验明这组配置能用。
 *
 * 只登录不发信——发信要等到真的有人注册。认证被拒这种错要等到用户点注册
 * 才发现太晚（那时看到的是一个 502 和一句「验证邮件没发出去」）。
 */
export async function checkSmtp(mailer: MailSender): Promise<SmtpCheckResult> {
  try {
    await mailer.verify()
    return { ok: true, failure: null }
  } catch (error) {
    return { ok: false, failure: describeSmtpFailure(error) }
  }
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
    // nodemailer 默认等 120 秒——邮件服务不可达时，服务端会像卡住一样。
    // 10 秒足够 SMTP 握手，超了就当失败，去日志里看原因。
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
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
    async verify() {
      await transport.verify()
    },
  }
}
