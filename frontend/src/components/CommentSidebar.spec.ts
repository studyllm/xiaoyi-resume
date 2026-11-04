// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { DiagnosisIssue } from '@/domain/types'
import type { StructureFinding } from '@/engines/structure'
import { useUiStore } from '@/stores/ui'
import CommentSidebar from './CommentSidebar.vue'
import SidebarFilters from './SidebarFilters.vue'

function finding(overrides: Partial<StructureFinding> = {}): StructureFinding {
  return {
    ruleId: 'missing-start',
    category: 'structure',
    severity: 'high',
    sectionId: 'sec-experience',
    sectionKind: 'experience',
    sectionTitle: '工作经历',
    itemId: 'item-1',
    itemLabel: '美团 · 前端工程师',
    bulletId: '',
    quote: '美团 · 前端工程师',
    highlight: '',
    problem: '这段经历没有开始时间，时间线无法核对。',
    suggestion: '补上开始时间。句式建议：「〈开始年月〉 - 〈结束年月〉」。',
    label: '缺少开始时间',
    field: 'start',
    sectionIndex: 1,
    itemIndex: 0,
    bulletIndex: -1,
    ...overrides,
  }
}

function issue(overrides: Partial<DiagnosisIssue> = {}): DiagnosisIssue {
  return {
    id: 'issue-1',
    ruleId: 'missing-start',
    category: 'structure',
    severity: 'high',
    sectionId: 'sec-experience',
    sectionKind: 'experience',
    sectionTitle: '工作经历',
    itemId: 'item-1',
    itemLabel: '美团 · 前端工程师',
    bulletId: 'bullet-1',
    quote: '负责活动页开发',
    highlight: '活动页开发',
    problem: '这段经历没有开始时间，时间线无法核对。',
    suggestion: '补上开始时间。',
    ...overrides,
  }
}

async function mountSidebar(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/diagnosis', component: { template: '<div />' } }],
  })
  await router.push('/diagnosis')
  await router.isReady()

  const wrapper = mount(CommentSidebar, {
    props: {
      issues: [],
      isHandled: () => false,
      isChanged: () => false,
      isIgnored: () => false,
      ...props,
    },
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('CommentSidebar 的结构问题清单', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // jsdom 默认窗口很窄，侧栏会自动收起来；这里按宽屏算
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  })

  it('没有结构问题时不出这一块', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.find('.structure-panel').exists()).toBe(false)
  })

  it('列出保存时发现的每一处结构问题', async () => {
    const wrapper = await mountSidebar({
      structureFindings: [
        finding(),
        finding({
          ruleId: 'missing-title',
          sectionTitle: '教育背景',
          sectionKind: 'education',
          sectionId: 'sec-education',
          itemId: 'edu-1',
          itemLabel: '清华大学',
          label: '缺少专业',
          field: 'title',
          severity: 'medium',
        }),
      ],
    })

    const panel = wrapper.find('.structure-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('保存时发现的 2 处问题')
    expect(panel.text()).toContain('缺少开始时间')
    expect(panel.text()).toContain('工作经历 · 美团 · 前端工程师')
    expect(panel.text()).toContain('缺少专业')
  })

  it('点一条会把这条问题报给页面', async () => {
    const wrapper = await mountSidebar({ structureFindings: [finding()] })
    await wrapper.find('.structure-item').trigger('click')

    const events = wrapper.emitted('locate')
    expect(events).toHaveLength(1)
    expect((events![0]![0] as StructureFinding).ruleId).toBe('missing-start')
  })

  it('折叠起来的时候也能看见有几处结构问题', async () => {
    const wrapper = await mountSidebar({ structureFindings: [finding()] })
    useUiStore().setSidebarCollapsed(true)
    await flushPromises()

    const collapsed = wrapper.find('.sidebar-collapsed')
    expect(collapsed.exists()).toBe(true)
    expect(collapsed.text()).toContain('⚠ 1')
  })
})

describe('CommentSidebar 的空状态', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  })

  it('还没诊断时侧栏展开，说明还没有诊断结果', async () => {
    const wrapper = await mountSidebar({ diagnosisState: 'none' })

    expect(wrapper.classes()).not.toContain('is-collapsed')
    expect(wrapper.text()).toContain('还没有诊断结果')
  })

  it('还没诊断时即使屏幕很窄也保持展开，引导要看得见', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    const wrapper = await mountSidebar({ diagnosisState: 'none' })

    expect(wrapper.classes()).not.toContain('is-collapsed')
    expect(wrapper.text()).toContain('还没有诊断结果')
  })

  it('诊断过却没有意见时收起来，展开后说明没有查出问题', async () => {
    const wrapper = await mountSidebar({ diagnosisState: 'empty' })
    expect(wrapper.classes()).toContain('is-collapsed')

    useUiStore().setSidebarCollapsed(false)
    await flushPromises()

    expect(wrapper.text()).toContain('没有查出问题')
    expect(wrapper.text()).not.toContain('还没有诊断结果')
  })

  it('空状态里的按钮把发起诊断的动作报给页面', async () => {
    const wrapper = await mountSidebar({ diagnosisState: 'none' })
    await wrapper.find('.sidebar-empty button').trigger('click')

    expect(wrapper.emitted('startDiagnosis')).toHaveLength(1)
  })

  it('空状态里的按钮用页面给的文案', async () => {
    const wrapper = await mountSidebar({ diagnosisState: 'none', emptyActionLabel: '去诊断' })

    expect(wrapper.find('.sidebar-empty button').text()).toContain('去诊断')
  })

  it('有意见但被筛选挡住时，说明是筛选挡住的，不是没有意见', async () => {
    const wrapper = await mountSidebar({ diagnosisState: 'result', issues: [issue()] })

    useUiStore().setSidebarCollapsed(false)
    await flushPromises()

    // 只看低危，这唯一的��高危意见就被挡住了
    await wrapper.findComponent(SidebarFilters).vm.$emit('update:severity', 'low')
    await flushPromises()

    expect(wrapper.text()).toContain('当前条件下没有批注')
    expect(wrapper.text()).not.toContain('还没有诊断结果')
  })

  it('清掉筛选就能看到批注', async () => {
    const wrapper = await mountSidebar({ diagnosisState: 'result', issues: [issue()] })

    useUiStore().setSidebarCollapsed(false)
    await flushPromises()

    await wrapper.findComponent(SidebarFilters).vm.$emit('update:severity', 'low')
    await flushPromises()

    const empty = wrapper.find('.sidebar-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('当前条件下没有批注')

    await empty.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('当前条件下没有批注')
    expect(wrapper.text()).toContain('活动页开发')
  })
})
