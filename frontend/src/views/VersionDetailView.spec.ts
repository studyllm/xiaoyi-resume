// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { ResumeVersion } from '@xiaoyi/shared/domain/types'
import { useVersionStore } from '@/stores/versions'
import VersionDetailView from './VersionDetailView.vue'

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
    createVersion: vi.fn(),
    deleteVersion: vi.fn(async () => undefined),
  }
})

function versionOf(id: string, explain?: ResumeVersion['explain']): ResumeVersion {
  return {
    id,
    userId: 'user-1',
    name: '前端工程师',
    profile: { name: '张三', headline: '', contacts: [] },
    body: '工作经历',
    sections: [],
    diff: [],
    uncovered: [],
    coverage: [],
    integrity: {
      checked: 0,
      violations: [],
      observations: [],
      generator: 'rules',
      reverted: 0,
      degraded: false,
    },
    engineVersion: 'x',
    jdRawText: '',
    jdRoleName: '前端工程师',
    draftRevision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    explain,
  }
}

async function mountDetail(version: ResumeVersion) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useVersionStore().versions = [version]

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/versions/:id', component: VersionDetailView },
      { path: '/versions/:id/print', component: { template: '<div />' } },
      { path: '/versions', component: { template: '<div />' } },
      { path: '/draft', component: { template: '<div />' } },
    ],
  })
  await router.push(`/versions/${version.id}`)
  await router.isReady()

  const wrapper = mount(VersionDetailView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('版本详情', () => {
  it('有「这一版是怎么来的」这个页签', async () => {
    const wrapper = await mountDetail(versionOf('ver-1'))

    expect(wrapper.text()).toContain('这一版是怎么来的')
  })

  it('没有记录生成过程的版本显示空态，不是空白', async () => {
    const wrapper = await mountDetail(versionOf('ver-1'))

    const tab = wrapper.findAll('.el-tabs__item').find((item) => item.text() === '这一版是怎么来的')
    expect(tab).toBeDefined()
    await tab!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('这一版生成时没有记录生成过程')
  })

  it('有记录时显示生成经过', async () => {
    const wrapper = await mountDetail(
      versionOf('ver-1', {
        pipeline: {
          requirementCount: 2,
          totalBullets: 3,
          comparedBullets: 3,
          keptBullets: 2,
          modelRewritten: 0,
          reverted: 0,
          checked: 2,
        },
        bullets: [],
        rewrites: [],
        model: { calls: [] },
      }),
    )

    const tab = wrapper.findAll('.el-tabs__item').find((item) => item.text() === '这一版是怎么来的')
    await tab!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('生成经过')
    expect(wrapper.text()).toContain('抽到 2 条要求')
  })
})
