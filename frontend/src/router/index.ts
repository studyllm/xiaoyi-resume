import { createRouter, createWebHistory } from 'vue-router'

import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { FAILURE_STATES, stateMessage } from '@xiaoyi/shared/domain/states'
import { RESET_PASSWORD_PATH, VERIFY_EMAIL_PATH } from '@xiaoyi/shared/domain/links'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    requiresDraft?: boolean
    /** 默认需要身份；导入页设为 false，让用户先看到解析结果再说 */
    requiresLogin?: boolean
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: DefaultLayout,
      children: [
        {
          path: '',
          name: 'welcome',
          component: () => import('@/views/WelcomeView.vue'),
          meta: { public: true, title: '首页' },
        },
        {
          path: 'import',
          name: 'import',
          component: () => import('@/views/ImportView.vue'),
          // 导入页可以匿名使用：粘贴、解析、在纸上改都不问身份，保存时才问
          meta: { requiresLogin: false, title: '导入简历' },
        },
        {
          path: 'draft',
          name: 'draft',
          component: () => import('@/views/DraftView.vue'),
          meta: { title: '我的简历' },
        },
        {
          path: 'diagnosis',
          name: 'diagnosis',
          component: () => import('@/views/DiagnosisView.vue'),
          meta: { requiresDraft: true, title: '简历诊断' },
        },
        {
          path: 'jd',
          name: 'jd',
          component: () => import('@/views/JdView.vue'),
          meta: { requiresDraft: true, title: '按 JD 生成' },
        },
        {
          path: 'versions',
          name: 'versions',
          component: () => import('@/views/VersionsView.vue'),
          meta: { title: '多 JD 版本' },
        },
        {
          path: 'versions/:id',
          name: 'version-detail',
          component: () => import('@/views/VersionDetailView.vue'),
          meta: { title: '多 JD 版本详情' },
        },
      ],
    },
    {
      path: '/versions/:id/print',
      name: 'version-print',
      component: () => import('@/views/VersionPrintView.vue'),
      meta: { title: '打印简历' },
    },
    // 从邮件链接进来的两个页面。放在顶层、不进工作台布局：它们是一次性的，
    // 顶栏与侧栏对刚点开邮件链接、还没登录的人没有意义。
    // **public 是必须的**——验证邮箱这个动作本身就是建立登录态的地方
    // （服务端在 verify-email 里直接建会话），进来之前没有登录态。
    {
      path: VERIFY_EMAIL_PATH,
      name: 'verify-email',
      component: () => import('@/views/VerifyEmailView.vue'),
      meta: { public: true, title: '验证邮箱' },
    },
    {
      path: RESET_PASSWORD_PATH,
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { public: true, title: '重置密码' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/draft' },
  ],
})

router.beforeEach(async (to, from) => {
  const session = useSessionStore()
  // 登录态在服务端，刷新后要先问一次「我是谁」再决定放不放行
  if (session.status === 'unknown') await session.restore()

  const draftStore = useDraftStore()
  if (draftStore.dirty && from.name === 'draft' && to.name !== 'draft') {
    const choice = await useUiStore().requestUnsavedChoice()
    if (choice === 'stay') return false
    if (choice === 'save') draftStore.saveEdits()
    else draftStore.discardEdits()
  }

  if (!session.isLoggedIn) {
    if (to.meta.public) return true
    // 导入页允许匿名使用：先让用户看到解析结果，保存时才问身份
    if (to.meta.requiresLogin === false) return true
    // 其余受限页面带着目标页回到落地页，落地页据此把身份对话框打开
    return { path: '/', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresDraft && !draftStore.hasDraft) {
    ElMessage.warning(stateMessage(FAILURE_STATES['draft-required']))
    return { path: '/import' }
  }

  return true
})

export default router
