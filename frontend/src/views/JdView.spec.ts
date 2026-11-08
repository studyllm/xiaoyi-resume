// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { fetchEngineStatus } from '@/api/resume'
import { useSessionStore } from '@/stores/session'
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
