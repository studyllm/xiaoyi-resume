import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Session, User } from '@xiaoyi/shared/domain/types'
import { persistence, readLastName, STORAGE_KEYS, writeLastName } from './persistence'

/** 名字到用户标识的拼法。存储分槽与登录态都用它，两边必须一致。 */
export function userIdOf(name: string): string {
  return `user-${name}`
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  /** 上次用过的名字。退出登录也保留，身份框靠它预填。 */
  const lastName = ref('')

  const isLoggedIn = computed(() => user.value !== null)

  /**
   * 当前用户决定读哪一份简历与版本。
   * 只有登录了才算当前用户——退出登录就是真的退出，界面回到「还没有简历」的样子。
   * 上次用过的名字只用来给身份框预填，不决定数据归属。
   */
  const currentUserId = computed(() => user.value?.id ?? '')

  function restore(): void {
    lastName.value = readLastName()
    const stored = persistence.read<{ user: User; session: Session }>(STORAGE_KEYS.session)
    if (!stored?.user || !stored?.session) return
    user.value = stored.user
    session.value = stored.session
  }

  /** 身份只是一个名字，用来标记这份简历归谁。原型不设密码。 */
  function login(name: string, options: { remember?: boolean } = {}): void {
    const userName = name.trim() || 'demo'
    const nextUser: User = { id: userIdOf(userName), username: userName }
    const nextSession: Session = {
      token: `token-${userName}`,
      user: nextUser,
      createdAt: new Date().toISOString(),
    }
    user.value = nextUser
    session.value = nextSession
    persistence.write(STORAGE_KEYS.session, { user: nextUser, session: nextSession })

    // 演示身份不是用户给自己起的名字，不该顶替它
    if (options.remember !== false) {
      lastName.value = userName
      writeLastName(userName)
    }
  }

  function logout(): void {
    user.value = null
    session.value = null
    persistence.remove(STORAGE_KEYS.session)
    // lastName 留着：下次回来还能想起上次用的名字
  }

  return {
    user,
    session,
    lastName,
    isLoggedIn,
    currentUserId,
    restore,
    login,
    logout,
  }
})
