import { describe, expect, it } from 'vitest'

import {
  createPersistence,
  draftKey,
  splitLegacySlots,
  STORAGE_KEYS,
  versionsKey,
  type StorageAdapter,
} from './persistence'

function memoryAdapter(): StorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

describe('createPersistence', () => {
  it('returns null for a key that was never written', () => {
    const persistence = createPersistence(memoryAdapter(), true)
    expect(persistence.read('xiaoyi.draft.v1')).toBeNull()
  })

  it('reads back a value that was written', () => {
    const persistence = createPersistence(memoryAdapter(), true)
    persistence.write('xiaoyi.draft.v2', { id: 'draft-1' })
    expect(persistence.read('xiaoyi.draft.v2')).toEqual({ id: 'draft-1' })
  })

  it('stores the value together with a version', () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(adapter, true)
    persistence.write('xiaoyi.draft.v2', { id: 'draft-1' })
    const stored = JSON.parse(adapter.map.get('xiaoyi.draft.v2')!)
    expect(stored.v).toBe(1)
    expect(stored.data).toEqual({ id: 'draft-1' })
  })

  it('removes a key', () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(adapter, true)
    persistence.write('xiaoyi.draft.v2', { id: 'draft-1' })
    persistence.remove('xiaoyi.draft.v2')
    expect(persistence.read('xiaoyi.draft.v2')).toBeNull()
  })

  it('migrates a value found under the oldest legacy key', () => {
    const adapter = memoryAdapter()
    adapter.setItem(
      'xiaoyi.draft.v0',
      JSON.stringify({
        v: 0,
        data: {
          sections: [
            {
              kind: 'experience',
              items: [{ org: '美团', title: '前端工程师', bullets: ['负责页面开发'] }],
            },
          ],
        },
      }),
    )

    const persistence = createPersistence(adapter, true)
    const value = persistence.read<{
      sections: Array<{ items: Array<{ bullets: Array<{ id: string; text: string }> }> }>
      profile: { name: string }
    }>('xiaoyi.draft.v2')

    expect(value).not.toBeNull()
    expect(value!.sections[0]!.items[0]!.bullets[0]!.text).toBe('负责页面开发')
    expect(value!.sections[0]!.items[0]!.bullets[0]!.id).toBeTruthy()
    expect(value!.profile.name).toBe('')
    expect(adapter.map.has('xiaoyi.draft.v0')).toBe(false)
    expect(adapter.map.has('xiaoyi.draft.v2')).toBe(true)
  })

  it('migrates a v1 draft and keeps its sections and bullets', () => {
    const adapter = memoryAdapter()
    adapter.setItem(
      'xiaoyi.draft.v1',
      JSON.stringify({
        v: 1,
        data: {
          id: 'draft-1',
          userId: 'user-1',
          revision: 4,
          updatedAt: '2026-01-01T00:00:00.000Z',
          sections: [
            {
              id: 'section-1',
              kind: 'experience',
              title: '工作经历',
              items: [
                {
                  id: 'item-1',
                  org: '美团',
                  title: '前端工程师',
                  start: '2021-03',
                  end: null,
                  present: true,
                  bullets: [{ id: 'bullet-1', text: '负责页面开发' }],
                },
              ],
            },
          ],
        },
      }),
    )

    const persistence = createPersistence(adapter, true)
    const value = persistence.read<{
      revision: number
      profile: { name: string; contacts: unknown[] }
      sections: Array<{ items: Array<{ bullets: Array<{ text: string }> }> }>
    }>('xiaoyi.draft.v2')

    expect(value).not.toBeNull()
    expect(value!.revision).toBe(4)
    expect(value!.sections[0]!.items[0]!.bullets[0]!.text).toBe('负责页面开发')
    expect(value!.profile.name).toBe('')
    expect(value!.profile.contacts).toEqual([])
    expect(adapter.map.has('xiaoyi.draft.v1')).toBe(false)
    expect(adapter.map.has('xiaoyi.draft.v2')).toBe(true)
  })

  it('migrates a v1 version list and backfills the fields it gained', () => {
    const adapter = memoryAdapter()
    adapter.setItem(
      'xiaoyi.versions.v1',
      JSON.stringify({
        v: 1,
        data: [
          {
            id: 'version-1',
            userId: 'user-1',
            name: '前端工程师',
            jdRawText: 'JD 原文',
            jdRoleName: '前端工程师',
            draftRevision: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            body: '工作经历\n美团 | 前端工程师 | 2021-03 - 至今',
            sections: [],
            diff: [],
            uncovered: [],
            integrity: { checked: 3, violations: [] },
            engineVersion: 'mock-0.1.0',
          },
        ],
      }),
    )

    const persistence = createPersistence(adapter, true)
    const value = persistence.read<
      Array<{ name: string; body: string; profile: { name: string }; coverage: unknown[] }>
    >('xiaoyi.versions.v2')

    expect(value).not.toBeNull()
    expect(value![0]!.name).toBe('前端工程师')
    expect(value![0]!.body).toContain('美团')
    expect(value![0]!.profile.name).toBe('')
    expect(value![0]!.coverage).toEqual([])
    expect(adapter.map.has('xiaoyi.versions.v1')).toBe(false)
    expect(adapter.map.has('xiaoyi.versions.v2')).toBe(true)
  })

  it('never migrates a legacy value of another family into the key being read', () => {
    const adapter = memoryAdapter()
    adapter.setItem(
      'xiaoyi.versions.v0',
      JSON.stringify({ v: 0, data: [{ id: 'version-1', name: '前端工程师' }] }),
    )

    const persistence = createPersistence(adapter, true)
    expect(persistence.read('xiaoyi.draft.v2')).toBeNull()
    expect(adapter.map.has('xiaoyi.versions.v0')).toBe(true)
  })

  it('discards a legacy value whose migration fails and warns once', () => {
    const adapter = memoryAdapter()
    adapter.setItem('xiaoyi.draft.v0', JSON.stringify({ v: 0, data: { broken: true } }))

    const persistence = createPersistence(adapter, true)
    expect(persistence.read('xiaoyi.draft.v2')).toBeNull()
    expect(persistence.takeWarnings().length).toBe(1)
    expect(persistence.takeWarnings().length).toBe(0)
  })

  it('keeps working when the storage is not persistent', () => {
    const persistence = createPersistence(memoryAdapter(), false)
    persistence.write('xiaoyi.session.v1', { token: 't' })
    expect(persistence.read('xiaoyi.session.v1')).toEqual({ token: 't' })
    expect(persistence.persistent).toBe(false)
  })

  it('survives a value that cannot be parsed', () => {
    const adapter = memoryAdapter()
    adapter.setItem('xiaoyi.draft.v2', 'not json')
    const persistence = createPersistence(adapter, true)
    expect(persistence.read('xiaoyi.draft.v2')).toBeNull()
  })
})

describe('旧存档按用户拆开', () => {
  it('简历归给记录里的那个用户', () => {
    const persistence = createPersistence(memoryAdapter(), true)
    persistence.write(STORAGE_KEYS.legacyDraft, { id: 'draft-1', userId: 'user-张三' })

    splitLegacySlots(persistence)

    expect(persistence.read<{ userId: string }>(draftKey('user-张三'))?.userId).toBe('user-张三')
    expect(persistence.read(STORAGE_KEYS.legacyDraft)).toBeNull()
  })

  it('版本按用户分组各归各家', () => {
    const persistence = createPersistence(memoryAdapter(), true)
    persistence.write(STORAGE_KEYS.legacyVersions, [
      { id: 'v1', userId: 'user-张三' },
      { id: 'v2', userId: 'user-李四' },
      { id: 'v3', userId: 'user-张三' },
    ])

    splitLegacySlots(persistence)

    expect(persistence.read<unknown[]>(versionsKey('user-张三'))).toHaveLength(2)
    expect(persistence.read<unknown[]>(versionsKey('user-李四'))).toHaveLength(1)
    expect(persistence.read(STORAGE_KEYS.legacyVersions)).toBeNull()
  })

  it('没有旧存档时不做任何事', () => {
    const persistence = createPersistence(memoryAdapter(), true)
    splitLegacySlots(persistence)
    expect(persistence.read(draftKey('user-张三'))).toBeNull()
  })
})
