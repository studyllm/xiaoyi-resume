import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, api } from '@/api/client'
import type { User } from '@xiaoyi/shared/domain/types'

/**
 * 登录态。
 *
 * 登录态在服务端：cookie 里是会话令牌，浏览器拿不到也伪造不了。
 * 这个 store 只持有「服务端说我是谁」的结果，不持有令牌本身。
 *
 * 身份是「邮箱 + 密码」，未验证的邮箱不能登录也不能保存（ADR-0002）。
 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  /** 上次用过的邮箱，只用来给登录框预填。 */
  const lastEmail = ref('')
  /** 还没问过服务端时是 unknown——不能当成「未登录」。 */
  const status = ref<'unknown' | 'guest' | 'user'>('unknown')
  /** 服务端连不上。不影响已加载的内容，但保存不了。 */
  const offline = ref(false)

  const isLoggedIn = computed(() => user.value !== null)

  /** 当前用户决定读哪一份简历与版本。 */
  const currentUserId = computed(() => user.value?.id ?? '')

  function setLastEmail(email: string): void {
    lastEmail.value = email.trim()
    localStorage.setItem('xiaoyi.lastEmail', lastEmail.value)
  }

  /** 问服务端「我是谁」。连不上就是离线，不是不确定。 */
  async function restore(): Promise<void> {
    lastEmail.value = localStorage.getItem('xiaoyi.lastEmail') ?? ''
    try {
      const result = await api<{ user: User }>('/api/v1/me')
      user.value = result.user
      status.value = 'user'
      offline.value = false
    } catch (error) {
      user.value = null
      if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
        status.value = 'guest'
        return
      }
      offline.value = true
      status.value = 'guest'
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const result = await api<{ user: User }>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = result.user
    status.value = 'user'
    setLastEmail(email)
  }

  /** 注册。成功不建立登录态——邮箱验证之后才能登录。 */
  async function register(email: string, password: string): Promise<void> {
    await api<{ email: string; verificationRequired: boolean }>('/api/v1/auth/register', {
      method: 'POST',
      body: { email, password },
    })
    setLastEmail(email)
  }

  /** 验证邮箱。成功即建立登录态。 */
  async function verifyEmail(token: string): Promise<void> {
    await api<void>('/api/v1/auth/verify-email', {
      method: 'POST',
      body: { token },
    })
    await restore()
  }

  /** 申请重置密码。无论邮箱存不存在都成功——不泄露账号注册过。 */
  async function requestPasswordReset(email: string): Promise<void> {
    await api<void>('/api/v1/auth/password-reset', {
      method: 'POST',
      body: { email },
    })
    setLastEmail(email)
  }

  async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    await api<void>('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: { token, newPassword },
    })
    user.value = null
    status.value = 'guest'
  }

  /** 落地页的「用示例简历试一遍」：现建一个临时账号。 */
  async function loginAsDemo(): Promise<void> {
    const result = await api<{ user: User }>('/api/v1/auth/demo', { method: 'POST' })
    user.value = result.user
    status.value = 'user'
  }

  /**
   * 退出登录。
   *
   * 服务端连不上也要清掉本地状态——用户点了「退出」，界面上就不能还显示着已登录。
   * 这时服务端的会话要到过期才失效，是可接受的代价。
   */
  async function logout(): Promise<void> {
    try {
      await api<void>('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // 忽略：本地状态照清
    } finally {
      user.value = null
      status.value = 'guest'
    }
  }

  /** 登出全清：这个账号的所有会话都失效。 */
  async function logoutAll(): Promise<void> {
    try {
      await api<void>('/api/v1/auth/logout-all', { method: 'POST' })
    } catch {
      // 同 logout：本地状态照清
    } finally {
      user.value = null
      status.value = 'guest'
    }
  }

  return {
    user,
    lastEmail,
    status,
    offline,
    isLoggedIn,
    currentUserId,
    restore,
    login,
    register,
    verifyEmail,
    requestPasswordReset,
    confirmPasswordReset,
    loginAsDemo,
    logout,
    logoutAll,
  }
})
