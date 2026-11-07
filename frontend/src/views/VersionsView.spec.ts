// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useSessionStore } from '@/stores/session'
import { useVersionStore } from '@/stores/versions'
import VersionsView from './VersionsView.vue'

// 服务端的简历读写在测试里 mock 掉：读取按「连不上」处理（退回本地缓存），
// 保存按成功处理。这样用例的语义不变——本地缓存仍是读的那一份。
vi.mock('@/api/resume', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/api/client')>('@/api/client')
  const { ALL_STATES } = await vi.importActual<
    typeof import('@xiaoyi/shared/domain/states')
  >('@xiaoyi/shared/domain/states')
  return {
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


async function mountVersions() {
  const pinia = createPinia()
  setActivePinia(pinia)
  { const s = useSessionStore(); s.user = { id: 'user-张三', email: 'zhang@example.com' }; s.status = 'user' }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/versions', component: VersionsView },
      { path: '/draft', component: { template: '<div />' } },
      { path: '/jd', component: { template: '<div />' } },
      { path: '/import', component: { template: '<div />' } },
      { path: '/versions/:id', component: { template: '<div />' } },
      { path: '/versions/:id/print', component: { template: '<div />' } },
    ],
  })
  await router.push('/versions')
  await router.isReady()

  const wrapper = mount(VersionsView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, store: useVersionStore() }
}

describe('VersionsView 的卡片', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('没有版本时给出空状态', async () => {
    const { wrapper } = await mountVersions()
    expect(wrapper.findAll('.version-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('还没有生成任何版本')
  })

  it('生成时间一行，操作按钮另起一行', async () => {
    const { wrapper, store } = await mountVersions()
    store.generate('前端工程师')
    await flushPromises()

    const buttons = wrapper.findAll('.version-card-actions button')
    expect(buttons).toHaveLength(4)
    for (const button of buttons) {
      expect(button.find('.el-icon').exists()).toBe(true)
    }
  })

  it('操作按钮与生成时间左对齐，并在行内均分', async () => {
    const source = readFileSync(join(process.cwd(), 'src/views/VersionsView.vue'), 'utf8')
    // 按钮自身的内边距会让第一个图标缩进去，归零后才跟生成时间对齐
    expect(source).toContain('.version-card-actions :deep(.el-button)')
    expect(source).toContain('padding-left: 0')
    expect(source).toContain('padding-right: 0')
    // 均分：第一个贴左（与生成时间对齐），最后一个贴右
    expect(source).toContain('justify-content: space-between')
  })

  it('删除入口是垃圾桶图标', async () => {
    const { wrapper, store } = await mountVersions()
    store.generate('前端工程师')
    await flushPromises()

    const remove = wrapper.find('.version-card .paper-delete')
    expect(remove.exists()).toBe(true)
    expect(remove.find('.el-icon').exists()).toBe(true)
    expect(remove.text().trim()).toBe('删除')
  })
})
