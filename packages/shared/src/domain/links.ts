/**
 * 邮件里的链接指向哪一页。
 *
 * **服务端建链接、前端接路由，引用同一份定义。** 两边各写一份路径、
 * 对不上没人拦——验证链接落不到页面上，症状是「点开邮件要登录，登录又说
 * 邮箱没验证」，没有人能看出中间少了路由（`CLAUDE.md` §1：共享包不是复制）。
 */
export const VERIFY_EMAIL_PATH = '/verify-email'

export const RESET_PASSWORD_PATH = '/reset-password'
