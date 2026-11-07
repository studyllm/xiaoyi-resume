// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createVersion, deleteVersion, fetchVersions } from '@/api/resume'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useVersionStore } from './versions'

// 服务端负责生成；前端只管「问服务端要、把结果放进列表」。
// 生成的语义（版本名怎么起、抬头怎么带）由共享引擎与服务端端点的用例覆盖。
vi.mock('@/api/resume', () => ({
  fetchVersions: vi.fn(async () => ({ items: [], total: 0 })),
  fetchVersion: vi.fn(),
  createVersion: vi.fn(),
  deleteVersion: vi.fn(async () => undefined),
}))

const VERSION = {
  id: 'ver-1',
  userId: 'user-1',
  name: '美团 前端工程师',
  profile: { name: '张三', headline: '', contacts: [] },
  body: '工作经历',
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
}

function login(): void {
  const session = useSessionStore()
  session.user = { id: 'user-1', email: 'zhang@example.com' }
  session.status = 'user'
}

describe('useVersionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchVersions).mockReset()
    vi.mocked(createVersion).mockReset()
    vi.mocked(deleteVersion).mockReset()
    vi.mocked(fetchVersions).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(createVersion).mockResolvedValue({ version: VERSION })
  })

  it('从服务端读版本列表', async () => {
    login()
    vi.mocked(fetchVersions).mockResolvedValue({ items: [VERSION], total: 1 })
    const store = useVersionStore()

    await store.restore()

    expect(vi.mocked(fetchVersions)).toHaveBeenCalled()
    expect(store.versions).toHaveLength(1)
    expect(store.versions[0]!.id).toBe('ver-1')
  })

  it('生成版本由服务端做，前端只把结果放进列表', async () => {
    login()
    const store = useVersionStore()

    const version = await store.generate('前端工程师 JD')

    expect(vi.mocked(createVersion)).toHaveBeenCalled()
    // 带幂等键：手快点两下不会生成两份
    const call = vi.mocked(createVersion).mock.calls[0]![0]
    expect(call.idempotencyKey).toBeTruthy()
    expect(call.jdText).toBe('前端工程师 JD')
    expect(version.id).toBe('ver-1')
    expect(store.versions).toHaveLength(1)
  })

  it('生成前先把未保存的改动存到服务端', async () => {
    login()
    const draftStore = useDraftStore()
    const savePending = vi.spyOn(draftStore, 'saveIfDirty')
    const store = useVersionStore()

    await store.generate('前端工程师 JD')

    expect(savePending).toHaveBeenCalled()
  })

  it('删版本先删服务端，再从列表里去掉', async () => {
    login()
    vi.mocked(fetchVersions).mockResolvedValue({ items: [VERSION], total: 1 })
    const store = useVersionStore()
    await store.restore()

    await store.remove('ver-1')

    expect(vi.mocked(deleteVersion)).toHaveBeenCalledWith('ver-1')
    expect(store.versions).toHaveLength(0)
  })

  it('没登录不能生成版本', async () => {
    const store = useVersionStore()
    await expect(store.generate('前端工程师 JD')).rejects.toThrow()
  })

  it('按 id 找版本', async () => {
    login()
    vi.mocked(fetchVersions).mockResolvedValue({ items: [VERSION], total: 1 })
    const store = useVersionStore()
    await store.restore()

    expect(store.byId('ver-1')?.name).toBe('美团 前端工程师')
    expect(store.byId('nope')).toBeUndefined()
  })
})
