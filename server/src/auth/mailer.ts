import { RESET_PASSWORD_PATH, VERIFY_EMAIL_PATH } from '@xiaoyi/shared/domain/links'

/**
 * 发信。
 *
 * 只发两种信：验证邮箱与重置密码。两者都只带一个令牌链接，不带任何简历内容
 * （`docs/privacy-conclusions.md` §4.1：邮件服务商不接触简历正文）。
 */
export interface OutgoingMail {
  to: string
  subject: string
  /** 纯文本正文。 */
  text: string
}

export interface MailSender {
  send(mail: OutgoingMail): Promise<void>
}

/** 站点对外的地址。验证与重置链接都指向它。 */
export interface MailConfig {
  /** 例如 https://xiaoyi.example.com */
  siteUrl: string
  /** 发信人地址。 */
  from: string
}

/**
 * 内存发信器。测试用：把发出的信记下来，断言「确实发给了谁、链接里是什么」。
 *
 * 与真实发信器语义一致——真实那封若发不出去，注册流程也要失败。
 */
export function createMemoryMailer(): MailSender & { sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = []
  return {
    sent,
    async send(mail) {
      sent.push(mail)
    },
  }
}

/** 链接里的令牌要能被邮件客户端正确解析，别让它把后面的参数吃掉。 */
function verificationLink(config: MailConfig, token: string): string {
  return `${config.siteUrl}${VERIFY_EMAIL_PATH}?token=${encodeURIComponent(token)}`
}

function resetLink(config: MailConfig, token: string): string {
  return `${config.siteUrl}${RESET_PASSWORD_PATH}?token=${encodeURIComponent(token)}`
}

export function verificationMail(config: MailConfig, to: string, token: string): OutgoingMail {
  return {
    to,
    subject: '确认你的邮箱',
    text: [
      '确认这个邮箱后就能保存简历、生成版本。',
      '',
      verificationLink(config, token),
      '',
      '链接 24 小时内有效，只能用一次。',
    ].join('\n'),
  }
}

export function passwordResetMail(config: MailConfig, to: string, token: string): OutgoingMail {
  return {
    to,
    subject: '重置密码',
    text: [
      '有人想重置这个账号的密码。如果不是你本人，忽略这封信就行。',
      '',
      resetLink(config, token),
      '',
      '链接 24 小时内有效，只能用一次。重置后原有会话全部失效。',
    ].join('\n'),
  }
}
