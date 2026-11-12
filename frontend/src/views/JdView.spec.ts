// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { fetchEngineStatus } from '@/api/resume'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useVersionStore } from '@/stores/versions'
import type { ResumeVersion } from '@xiaoyi/shared/domain/types'
import JdView from './JdView.vue'

vi.mock('@/api/resume', () => ({
  fetchEngineStatus: vi.fn(async () => ({ available: false })),
  fetchDraft: vi.fn(),
  saveDraft: vi.fn(),
  fetchVersions: vi.fn(async () => ({ items: [], total: 0 })),
  fetchVersion: vi.fn(),
  createVersion: vi.fn(),
  deleteVersion: vi.fn(),
}))

async function mountJd() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.user = { id: 'user-1', email: 'zhang@example.com' }
  session.status = 'user'

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/jd', component: { template: '<div />' } },
      { path: '/versions/:id', component: { template: '<div />' } },
    ],
  })
  await router.push('/jd')
  await router.isReady()

  const wrapper = mount(JdView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

describe('模型没调通时要说清原因', () => {
  beforeEach(() => {
    vi.mocked(fetchEngineStatus).mockReset()
    vi.mocked(fetchEngineStatus).mockResolvedValue({ available: true })
  })

  it('生成完当场说清为什么没用上模型', async () => {
    const wrapper = await mountJd()

    // 给一份底稿——生成版本必须基于已保存的内容
    const draftStore = useDraftStore()
    draftStore.draft = {
      id: 'draft-1',
      userId: 'user-1',
      revision: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      profile: { name: '张三', headline: '', contacts: [] },
      sections: [],
    }
    // 直接把生成结果给出来，不走接口
    const versionStore = useVersionStore()
    vi.spyOn(versionStore, 'generate').mockResolvedValue({
      id: 'ver-1',
      userId: 'user-1',
      name: '版本',
      profile: { name: '', headline: '', contacts: [] },
      jdRawText: '',
      jdRoleName: '',
      draftRevision: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      body: '',
      sections: [],
      diff: [],
      uncovered: [],
      coverage: [],
      integrity: {
        checked: 50,
        violations: [],
        observations: [],
        generator: 'rules',
        reverted: 0,
        degraded: true,
        degradeReason: '模型返回 402：insufficient balance (1008)',
      },
      engineVersion: 'x',
    })

    await wrapper.find('textarea').setValue('高级后端工程师\n\n任职要求：\n1. 熟悉 Java\n')
    await wrapper.findAll('button').find((b) => b.text().includes('解析 JD'))!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('生成版本'))!.trigger('click')
    await flushPromises()

    // 提示里要能看到真正的原因，而不是只说「模型没用上」
    const messages = [...document.querySelectorAll('.el-message')].map((el) => el.textContent ?? '')
    expect(messages.join(' ')).toContain('insufficient balance')
  })
})

describe('生成时的等待提示', () => {
  beforeEach(() => {
    vi.mocked(fetchEngineStatus).mockReset()
    vi.mocked(fetchEngineStatus).mockResolvedValue({ available: true })
  })

  it('等模型的时候说清在等什么、已经等了多久', async () => {
    const wrapper = await mountJd()
    const draftStore = useDraftStore()
    draftStore.draft = {
      id: 'draft-1',
      userId: 'user-1',
      revision: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      profile: { name: '张三', headline: '', contacts: [] },
      sections: [],
    }
    const versionStore = useVersionStore()
    // 生成一直没结束——用户需要看到「还在等」
    const pending: { finish?: (version: ResumeVersion) => void } = {}
    vi.spyOn(versionStore, 'generate').mockImplementation(
      () => new Promise((resolve) => { pending.finish = resolve }),
    )

    await wrapper.find('textarea').setValue('高级后端工程师\n\n任职要求：\n1. 熟悉 Java\n')
    await wrapper.findAll('button').find((b) => b.text().includes('解析 JD'))!.trigger('click')
    await flushPromises()
    // 勾上「本次用模型改写」
    const modelSwitch = wrapper.findAll('.el-switch').find((sw) => sw.text().includes('本次用模型'))
    await modelSwitch!.trigger('click')
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('生成版本'))!.trigger('click')
    await flushPromises()

    // 提示说清在等模型，并且有计时
    expect(wrapper.text()).toContain('正在等模型改写')
    expect(wrapper.text()).toContain('调不通时会自动改用规则引擎')
    expect(wrapper.text()).toMatch(/已等待 \d+ 秒/)

    pending.finish?.({
      id: 'ver-1',
      userId: 'user-1',
      name: '版本',
      profile: { name: '', headline: '', contacts: [] },
      jdRawText: '',
      jdRoleName: '',
      draftRevision: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      body: '',
      sections: [],
      diff: [],
      uncovered: [],
      coverage: [],
      integrity: { checked: 0, violations: [], observations: [], generator: 'rules', reverted: 0, degraded: false },
      engineVersion: 'x',
    })
    await flushPromises()
    // 结束后提示消失
    expect(wrapper.text()).not.toContain('正在等模型改写')
  })
})

describe('生成选项里的模型开关', () => {
  beforeEach(() => {
    vi.mocked(fetchEngineStatus).mockReset()
  })

  it('服务端没配供应商时不显示那个开关', async () => {
    vi.mocked(fetchEngineStatus).mockResolvedValue({ available: false })
    const wrapper = await mountJd()

    expect(wrapper.text()).not.toContain('本次用模型改写')
  })

  it('配了供应商时显示那个开关，而且默认是关的', async () => {
    vi.mocked(fetchEngineStatus).mockResolvedValue({ available: true })
    const wrapper = await mountJd()

    expect(wrapper.text()).toContain('本次用模型改写')
    const switches = wrapper.findAll('.el-switch')
    const modelSwitch = switches.find((item) => item.text().includes('本次用模型改写'))
    expect(modelSwitch?.classes()).not.toContain('is-checked')
  })

  it('问不到服务端时当没有模型，不显示开关也不报错', async () => {
    vi.mocked(fetchEngineStatus).mockRejectedValue(new Error('连不上'))
    const wrapper = await mountJd()

    expect(wrapper.text()).not.toContain('本次用模型改写')
  })
})
