// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import DiagnosisView from './DiagnosisView.vue'

// 服务端的简历读写在测试里 mock 掉：读取按「连不上」处理（退回本地缓存），
// 保存按成功处理。这样用例的语义不变——本地缓存仍是读的那一份。
vi.mock('@/api/resume', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/api/client')>('@/api/client')
  const { ALL_STATES } = await vi.importActual<
    typeof import('@xiaoyi/shared/domain/states')
  >('@xiaoyi/shared/domain/states')
  const { parseDraft } = await vi.importActual<
    typeof import('@xiaoyi/shared/engines/parseDraft')
  >('@xiaoyi/shared/engines/parseDraft')
  const { createIdSeed } = await vi.importActual<
    typeof import('@xiaoyi/shared/domain/ids')
  >('@xiaoyi/shared/domain/ids')
  return {
    // 解析走服务端：mock 里用同一份引擎源码算，语义与服务端一致
    parseResume: vi.fn(async (text: string) => {
      if (!text.trim()) throw new ApiError('RESUME_EMPTY', ALL_STATES['parse-empty']!)
      const result = parseDraft(
        text,
        { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' },
        createIdSeed(),
      )
      if (!result.ok) throw new ApiError('PARSE_FAILED', ALL_STATES['parse-failed']!)
      return {
        draft: result.draft,
        confidence: result.confidence,
        warnings: result.warnings,
        otherHeaders: result.otherHeaders,
      }
    }),
    fetchDraft: vi.fn(async () => {
      throw new ApiError('UNKNOWN', ALL_STATES['offline']!, undefined, undefined, true)
    }),
    saveDraft: vi.fn(async (_draft: unknown, revision: number) => ({
      revision: revision + 1,
      savedAt: '2026-01-01T00:00:00.000Z',
    })),
    fetchVersions: vi.fn(async () => ({ items: [], total: 0 })),
    fetchVersion: vi.fn(),
    createVersion: vi.fn(async () => ({
      version: {
        id: 'ver-1',
        userId: '',
        name: '版本',
        profile: { name: '', headline: '', contacts: [] },
        body: '',
        sections: [],
        diff: [],
        uncovered: [],
        coverage: [],
        integrity: { checked: 0, violations: [] },
        engineVersion: 'x',
        jdRawText: '',
        jdRoleName: '',
        draftRevision: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })),
    deleteVersion: vi.fn(async () => undefined),
  }
})


const RESUME = `工作经历
美团 前端工程师 2021.03 - 至今
· 负责活动平台的前端开发
`

async function mountDiagnosis(resume = RESUME) {
  const pinia = createPinia()
  setActivePinia(pinia)
  { const s = useSessionStore(); s.user = { id: 'user-张三', email: 'zhang@example.com' }; s.status = 'user' }
  const store = useDraftStore()
  await store.ingest(resume)
  await store.savePending()

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
