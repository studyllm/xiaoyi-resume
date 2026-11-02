// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import IdentityDialog from '@/components/IdentityDialog.vue'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import WelcomeView from './WelcomeView.vue'

async function mountLanding(query = '', setup?: () => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  setup?.()

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: WelcomeView },
      { path: '/import', component: { template: '<div />' } },
      { path: '/draft', component: { template: '<div />' } },
      { path: '/jd', component: { template: '<div />' } },
    ],
  })
  await router.push(`/${query}`)
  await router.isReady()

  const wrapper = mount(WelcomeView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, router }
}

type LandingWrapper = Awaited<ReturnType<typeof mountLanding>>['wrapper']

function buttonByText(wrapper: LandingWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}

describe('落地页', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('样例区给出三条批注，每条带自己严重度的标记', async () => {
    const { wrapper } = await mountLanding()
    const comments = wrapper.findAll('.showcase-comment')
    expect(comments).toHaveLength(3)

    const severities = comments.map((comment) =>
      comment.classes().find((name) => name.startsWith('is-')),
    )
    expect(severities).toEqual(['is-medium', 'is-medium', 'is-low'])
  })

  it('样例纸展示的是一段经历，被批注的句子在纸上被标出', async () => {
    const { wrapper } = await mountLanding()
    const paper = wrapper.find('.landing-showcase-canvas')
    expect(paper.text()).toContain('工作经历')
    expect(paper.text()).toContain('负责公司营销活动页面的前端开发')
    expect(paper.findAll('mark')).toHaveLength(3)
  })

  it('顶栏与首屏内容共用同一个容器', async () => {
    const { wrapper } = await mountLanding()
    expect(wrapper.find('.landing-header-inner').classes()).toContain('landing-container')
    expect(wrapper.find('.landing-hero').classes()).toContain('landing-container')
  })

  it('两个入口动作的名字是「导入我的简历」与「用示例简历试一遍」', async () => {
    const { wrapper } = await mountLanding()
    expect(buttonByText(wrapper, '导入我的简历')).toBeTruthy()
    expect(buttonByText(wrapper, '用示例简历试一遍')).toBeTruthy()
  })

  it('有自己的简历时主动作是「打开我的简历」', async () => {
    const { wrapper } = await mountLanding('', () => {
      const session = useSessionStore()
      session.login('李四')
      const draftStore = useDraftStore()
      draftStore.ingest('工作经历\n美团 前端工程师 2021.03 - 至今\n· 负责活动页开发')
      draftStore.savePending()
    })
    expect(buttonByText(wrapper, '打开我的简历')).toBeTruthy()
  })

  it('退出登录后回到「导入我的简历」', async () => {
    const { wrapper } = await mountLanding('', () => {
      const session = useSessionStore()
      session.login('李四')
      const draftStore = useDraftStore()
      draftStore.ingest('工作经历\n美团 前端工程师 2021.03 - 至今\n· 负责活动页开发')
      draftStore.savePending()
      session.logout()
      draftStore.restore()
    })
    expect(buttonByText(wrapper, '导入我的简历')).toBeTruthy()
    expect(
      wrapper.findAll('button').some((button) => button.text().includes('打开我的简历')),
    ).toBe(false)
  })

  it('点主按钮直接进入导入页，不问身份', async () => {
    const { wrapper, router } = await mountLanding()
    await buttonByText(wrapper, '导入我的简历').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/import')
    expect(wrapper.findComponent(IdentityDialog).props('modelValue')).toBe(false)
  })

  it('被守卫带回落地页时自动打开身份对话框', async () => {
    const { wrapper } = await mountLanding('?redirect=/draft')
    await flushPromises()
    expect(wrapper.findComponent(IdentityDialog).props('modelValue')).toBe(true)
  })

  it('确认身份后回到原本要去的页面', async () => {
    const { wrapper, router } = await mountLanding('?redirect=/draft')
    await flushPromises()

    const dialog = wrapper.findComponent(IdentityDialog)
    await dialog.findAllComponents({ name: 'ElInput' })[0]!.setValue('张三')
    const confirm = dialog
      .findAllComponents({ name: 'ElButton' })
      .find((node) => node.text().includes('继续'))!
    await confirm.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/draft')
  })

  it('落地页里没有登录表单', async () => {
    const { wrapper } = await mountLanding()
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
