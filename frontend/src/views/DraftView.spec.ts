// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import DraftView from './DraftView.vue'

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
· 主导活动平台前端架构升级，页面构建时间从 120s 降到 18s
`

const RESUME_MISSING_TIME = `工作经历
美团 前端工程师
· 负责活动平台的前端开发
`

const RESUME_VAGUE = `工作经历
美团 前端工程师 2021.03 - 至今
· 参与团队协作与日常维护
`

async function mountEditor(resume = RESUME, enterEdit = true) {
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
      { path: '/draft', component: DraftView },
      { path: '/diagnosis', component: { template: '<div />' } },
      { path: '/import', component: { template: '<div />' } },
    ],
  })
  await router.push('/draft')
  await router.isReady()

  if (enterEdit) useUiStore().requestEditMode('issue-1')
  const wrapper = mount(DraftView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, store }
}

type EditorWrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']

function buttonByText(wrapper: EditorWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}

/** 跑一次诊断，页面上才有批注可看。 */
async function mountEditorWithDiagnosis(resume = RESUME) {
  const { wrapper, store } = await mountEditor(resume)
  store.diagnose()
  await flushPromises()
  return { wrapper, store }
}

describe('DraftView 编辑模式的键盘流', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('进入编辑模式后纸上的字段可以编辑', async () => {
    const { wrapper } = await mountEditor()
    expect(wrapper.find('.paper-field--input').exists()).toBe(true)
  })


  it('Cmd+Enter 保存并退出编辑模式', async () => {
    const { wrapper, store } = await mountEditor()
    const input = wrapper.find('.paper-field--input input')
    await input.setValue('新公司')
    expect(store.dirty).toBe(true)

    await input.trigger('keydown', { key: 'Enter', metaKey: true })
    await flushPromises()

    expect(store.dirty).toBe(false)
    expect(wrapper.find('.paper-field--input').exists()).toBe(false)
  })






})

describe('DraftView 纸面上的诊断痕迹', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })


  it('页面上没有集中的结构问题清单', async () => {
    const { wrapper } = await mountEditor(RESUME_MISSING_TIME)
    expect(wrapper.find('.el-alert').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('这份简历还有结构问题')
  })

  it('预览模式下纸面不出现结构标注', async () => {
    const { wrapper } = await mountEditor(RESUME_MISSING_TIME, false)
    expect(wrapper.findAll('.paper-marker')).toHaveLength(0)
  })



  it('批注按简历里的位置排列，不按严重度', async () => {
    const { wrapper, store } = await mountEditorWithDiagnosis(
      '工作经历\n甲公司 前端工程师 2021.03 - 2023.01\n· 参与团队协作与日常维护\n乙公司 2023.02 - 至今\n· 负责后端服务开发\n',
    )
    const section = store.draft!.sections.find((entry) => entry.kind === 'experience')!
    // 解析后按时间倒序：乙（更近）在前，甲（更远）在后
    const later = section.items.find((item) => item.org === '甲公司')!
    // 让排在后面的那条缺开始时间——它的严重度最高
    store.updateItemMeta(section.id, later.id, { start: null })
    store.diagnose()
    await flushPromises()

    // 引擎按严重度排：缺开始时间是「高」，排在最前
    expect(store.liveIssues[0]!.ruleId).toBe('missing-start')
    // 界面按简历位置排：乙在前，甲的要点在后——与严重度的顺序正好相反
    const anchors = wrapper.findAll('.comment-sidebar .comment-anchor').map((node) => node.text())
    const earlierAnchor = anchors.findIndex((anchor) => anchor.includes('乙公司'))
    const laterAnchor = anchors.findIndex((anchor) => anchor.includes('参与团队协作'))
    expect(earlierAnchor).toBeGreaterThanOrEqual(0)
    expect(earlierAnchor).toBeLessThan(laterAnchor)
  })
})

describe('DraftView 编辑器的行为', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // jsdom 没有实现 scrollIntoView，定位到某条批注时会调用它
    Element.prototype.scrollIntoView = () => {}
  })






  it('保存后右侧栏顶部列出结构问题', async () => {
    const { wrapper, store } = await mountEditor(RESUME)
    const section = store.draft!.sections.find((entry) => entry.kind === 'experience')!
    store.updateItemMeta(section.id, section.items[0]!.id, { start: null })
    await flushPromises()

    await buttonByText(wrapper, '保存').trigger('click')
    await flushPromises()

    const panel = wrapper.find('.structure-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('保存时发现的 1 处问题')
    expect(panel.text()).toContain('缺少开始时间')
  })

  it('点清单里的一条会跳到出问题的那个字段', async () => {
    const { wrapper, store } = await mountEditor(RESUME)
    const section = store.draft!.sections.find((entry) => entry.kind === 'experience')!
    store.updateItemMeta(section.id, section.items[0]!.id, { start: null })
    await flushPromises()

    await buttonByText(wrapper, '保存').trigger('click')
    await flushPromises()
    await wrapper.find('.structure-item').trigger('click')
    await flushPromises()

    const dateInput = wrapper.findAll('.paper-date-field input')[0]!.element
    expect(document.activeElement).toBe(dateInput)
  })

  it('没有结构问题时保存后切到预览', async () => {
    const { wrapper } = await mountEditor(RESUME)
    await wrapper.find('.paper-field--input input').setValue('新公司')

    await buttonByText(wrapper, '保存').trigger('click')
    await flushPromises()

    expect(wrapper.find('.paper-field--input').exists()).toBe(false)
    expect(wrapper.find('.structure-panel').exists()).toBe(false)
  })

  it('批注可以标记已处理，也可以忽略', async () => {
    const { wrapper } = await mountEditorWithDiagnosis(RESUME_VAGUE)
    const card = () => wrapper.find('.comment-sidebar .comment')

    const handle = card().findAll('button').find((button) => button.text().includes('标记已处理'))!
    await handle.trigger('click')
    await flushPromises()
    expect(wrapper.find('.comment-sidebar .comment--handled').exists()).toBe(true)

    const before = wrapper.findAll('.comment-sidebar .comment').length
    const ignore = card().findAll('button').find((button) => button.text().includes('忽略此条'))!
    await ignore.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.comment-sidebar .comment')).toHaveLength(before - 1)
  })

  it('批注栏折叠时列出各严重程度的条数', async () => {
    const { wrapper } = await mountEditorWithDiagnosis(RESUME_VAGUE)
    useUiStore().setSidebarCollapsed(true)
    await flushPromises()

    const collapsed = wrapper.find('.sidebar-collapsed')
    expect(collapsed.exists()).toBe(true)
    expect(collapsed.text()).toContain('批注')

    const severity = wrapper.findAll('.collapsed-severity')[1]!
    await severity.trigger('click')
    await flushPromises()
    expect(wrapper.find('.comment-sidebar').classes()).not.toContain('is-collapsed')
  })
})
