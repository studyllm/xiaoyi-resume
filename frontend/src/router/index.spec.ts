// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import router from './index'

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

/** 等路由守卫跑到等待选择那一步。 */
async function flushGuard(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function setupDirtyDraft(): Promise<ReturnType<typeof useDraftStore>> {
  const draftStore = useDraftStore()
  await draftStore.ingest(RESUME)
  await draftStore.savePending()
  draftStore.updateProfile({ name: '临时改动' })
  return draftStore
}

describe('路由离开时的未保存提示', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    { const s = useSessionStore(); s.user = { id: 'user-张三', email: 'zhang@example.com' }; s.status = 'user' }
    await router.push('/')
  })

  it('留在本页时不离开，也不改动内容', async () => {
    const draftStore = await setupDirtyDraft()
    await router.push('/draft')
    const uiStore = useUiStore()

    const navigation = router.push('/diagnosis')
    await flushGuard()
    uiStore.resolveUnsavedChoice('stay')
    await navigation

    expect(router.currentRoute.value.path).toBe('/draft')
    expect(draftStore.dirty).toBe(true)
    expect(draftStore.draft!.profile.name).toBe('临时改动')
  })

  it('保存并离开时先存一次，修订号加一', async () => {
    const draftStore = await setupDirtyDraft()
    await router.push('/draft')
    const uiStore = useUiStore()
    const before = draftStore.savedRevision

    const navigation = router.push('/diagnosis')
    await flushGuard()
    uiStore.resolveUnsavedChoice('save')
    await navigation

    expect(router.currentRoute.value.path).toBe('/diagnosis')
    expect(draftStore.dirty).toBe(false)
    expect(draftStore.savedRevision).toBe(before + 1)
    expect(draftStore.draft!.profile.name).toBe('临时改动')
  })

  it('放弃修改并离开时回到上次保存的样子', async () => {
    const draftStore = await setupDirtyDraft()
    await router.push('/draft')
    const uiStore = useUiStore()

    const navigation = router.push('/diagnosis')
    await flushGuard()
    uiStore.resolveUnsavedChoice('discard')
    await navigation

    expect(router.currentRoute.value.path).toBe('/diagnosis')
    expect(draftStore.dirty).toBe(false)
    expect(draftStore.draft!.profile.name).not.toBe('临时改动')
  })

  it('没有未保存的修改时直接离开', async () => {
    const draftStore = await setupDirtyDraft()
    await router.push('/draft')
    await draftStore.saveEdits()

    await router.push('/diagnosis')
    expect(router.currentRoute.value.path).toBe('/diagnosis')
  })
})

describe('未登录时能去哪些页面', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await router.push('/')
  })

  it('导入页可以匿名打开', async () => {
    await router.push('/import')
    expect(router.currentRoute.value.path).toBe('/import')
  })

  it('其它受限页面被带到落地页，并带着目标页', async () => {
    await router.push('/draft')
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query.redirect).toBe('/draft')
  })
})
