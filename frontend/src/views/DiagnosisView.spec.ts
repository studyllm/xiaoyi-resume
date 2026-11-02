// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import DiagnosisView from './DiagnosisView.vue'

const RESUME = `工作经历
美团 前端工程师 2021.03 - 至今
· 负责活动平台的前端开发
`

async function mountDiagnosis(resume = RESUME) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().login('张三')
  const store = useDraftStore()
  store.ingest(resume)
  store.savePending()

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/draft', component: { template: '<div />' } },
      { path: '/diagnosis', component: DiagnosisView },
    ],
  })
  await router.push('/diagnosis')
  await router.isReady()

  const wrapper = mount(DiagnosisView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, store, pinia, router }
}

type DiagnosisWrapper = Awaited<ReturnType<typeof mountDiagnosis>>['wrapper']

function buttonByText(wrapper: DiagnosisWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}

describe('DiagnosisView 的诊断是显式发起的', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // jsdom 没有实现 scrollIntoView，定位到批注时会调用它
    Element.prototype.scrollIntoView = () => {}
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  })

  it('进入诊断页不会自动诊断', async () => {
    const { wrapper, store } = await mountDiagnosis()

    expect(store.diagnosis).toBe(null)
    expect(wrapper.text()).toContain('还没有诊断结果')
  })

  it('还没诊断时纸面是干净的', async () => {
    const { wrapper } = await mountDiagnosis()

    expect(wrapper.findAll('.paper-mark')).toHaveLength(0)
    expect(wrapper.findAll('.is-marked')).toHaveLength(0)
  })

  it('点开始诊断之后意见出现，纸面标出位置', async () => {
    const { wrapper, store } = await mountDiagnosis()
    expect(store.diagnosis).toBe(null)

    await buttonByText(wrapper, '开始诊断').trigger('click')
    await flushPromises()

    expect(store.diagnosis).not.toBe(null)
    expect(wrapper.findAll('.comment-sidebar .comment').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.paper-mark').length).toBeGreaterThan(0)
  })

  it('已经有诊断结果时不自动重新诊断', async () => {
    const { wrapper, store, pinia, router } = await mountDiagnosis()
    await buttonByText(wrapper, '开始诊断').trigger('click')
    await flushPromises()
    const first = store.diagnosis!

    wrapper.unmount()
    const again = mount(DiagnosisView, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    expect(store.diagnosis).toBe(first)
    expect(again.findAll('.comment-sidebar .comment').length).toBeGreaterThan(0)
  })
})

describe('DiagnosisView 的清空诊断结果', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Element.prototype.scrollIntoView = () => {}
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  })

  it('还没诊断时不提供清空入口', async () => {
    const { wrapper } = await mountDiagnosis()

    const buttons = wrapper
      .findAll('button')
      .filter((button) => button.text().includes('清空诊断结果'))
    expect(buttons).toHaveLength(0)
  })

  it('清空之后回到还没诊断的状态', async () => {
    const { wrapper, store } = await mountDiagnosis()
    await buttonByText(wrapper, '开始诊断').trigger('click')
    await flushPromises()

    await buttonByText(wrapper, '清空诊断结果').trigger('click')
    await flushPromises()

    expect(store.diagnosis).toBe(null)
    expect(wrapper.text()).toContain('还没有诊断结果')
    expect(wrapper.findAll('.paper-mark')).toHaveLength(0)
  })

  it('清空会把已处理与已忽略的标记一起清掉', async () => {
    const { wrapper, store } = await mountDiagnosis()
    await buttonByText(wrapper, '开始诊断').trigger('click')
    await flushPromises()

    const ui = useUiStore()
    const issue = store.liveIssues.find((entry) => entry.ruleId === 'responsibility-no-result')!
    ui.markHandled(issue.id)
    ui.ignoreIssue(issue.id)
    await flushPromises()

    expect(ui.isHandled(issue.id)).toBe(true)
    expect(ui.isIssueIgnored(issue.id)).toBe(true)

    await buttonByText(wrapper, '清空诊断结果').trigger('click')
    await flushPromises()

    expect(ui.isHandled(issue.id)).toBe(false)
    expect(ui.isIssueIgnored(issue.id)).toBe(false)
  })

  it('清空之后重新诊断，同一条意见不再带旧的标记', async () => {
    const { wrapper, store } = await mountDiagnosis()
    await buttonByText(wrapper, '开始诊断').trigger('click')
    await flushPromises()

    const ui = useUiStore()
    const issue = store.liveIssues.find((entry) => entry.ruleId === 'responsibility-no-result')!
    ui.markHandled(issue.id)
    await flushPromises()

    await buttonByText(wrapper, '清空诊断结果').trigger('click')
    await flushPromises()
    await buttonByText(wrapper, '开始诊断').trigger('click')
    await flushPromises()

    const again = store.liveIssues.find((entry) => entry.ruleId === 'responsibility-no-result')!
    expect(again.id).toBe(issue.id)
    expect(ui.isHandled(again.id)).toBe(false)
  })
})
