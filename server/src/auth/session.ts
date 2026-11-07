import { randomBytes } from 'node:crypto'

import type { FastifyReply, FastifyRequest } from 'fastify'

import { hashToken } from '../db/store'
import type { Store, StoredSession, StoredUser } from '../db/store'

/** 会话 cookie 的名字。 */
export const SESSION_COOKIE = 'session'

/** 会话的绝对有效期：30 天。到期必须重新登录。 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 令牌与验证令牌的有效期：24 小时，一次性。 */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

/** 生成高熵随机串。 */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * 建立会话并把 cookie 写上。
 *
 * **cookie 里是原始令牌，库里存的是它的哈希**——库泄露不等于会话被偷。
 * cookie 是 httpOnly + SameSite=Lax，脚本读不到，跨站请求也不带。
 */
export async function createSession(
  store: Store,
  userId: string,
  reply: FastifyReply,
): Promise<StoredSession> {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await store.createSession({ id: hashToken(token), userId, expiresAt })

  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    expires: expiresAt,
  })

  return { id: hashToken(token), userId, createdAt: new Date(), expiresAt }
}

/** 读当前请求的会话。没登录或已过期都返回 null。 */
export async function readSession(
  store: Store,
  request: FastifyRequest,
): Promise<StoredSession | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null

  const session = await store.findSession(hashToken(token))
  if (!session) return null

  if (session.expiresAt.getTime() <= Date.now()) {
    await store.deleteSession(session.id)
    return null
  }

  return session
}

/** 滑动续期：剩余不足一半时，把到期时间往后推。 */
export async function renewSession(
  store: Store,
  session: StoredSession,
): Promise<void> {
  const remaining = session.expiresAt.getTime() - Date.now()
  if (remaining > SESSION_TTL_MS / 2) return
  await store.touchSession(session.id, new Date(Date.now() + SESSION_TTL_MS))
}

/** 清掉当前会话的 cookie。 */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** 取当前请求的登录用户。没登录返回 null。 */
export async function currentUser(
  store: Store,
  request: FastifyRequest,
): Promise<StoredUser | null> {
  const session = await readSession(store, request)
  if (!session) return null
  await renewSession(store, session)
  return store.findUserById(session.userId)
}
