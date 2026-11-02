import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Draft } from '@/domain/types'
import { useDraftStore } from './draft'
import { useSessionStore } from './session'
import { useVersionStore } from './versions'

const RESUME = `工作经历
美团 前端工程师 2021.03 - 至今
· 主导活动平台前端架构升级，页面构建时间从 120s 降到 18s

专业技能
前端：Vue、React、TypeScript
`

const JD = `前端工程师

任职要求：
1. 精通 Vue 和 TypeScript
2. 熟悉 Docker 与 CI/CD 流程
`

function seedDraft(): Draft {
  useSessionStore().login('张三')
  const draftStore = useDraftStore()
  draftStore.ingest(RESUME)
  draftStore.savePending()
  return draftStore.draft!
}

describe('useVersionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts without any version', () => {
    const store = useVersionStore()
    expect(store.versions).toEqual([])
  })

  it('generates a version from the current draft', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const version = store.generate(draft, JD)
    expect(store.versions).toHaveLength(1)
    expect(version.body).toContain('美团')
    expect(version.draftRevision).toBe(draft.revision)
  })

  it('saves the unsaved changes before generating a version', () => {
    const draft = seedDraft()
    const draftStore = useDraftStore()
    const before = draft.revision
    draftStore.updateProfile({ name: '李四' })
    expect(draftStore.dirty).toBe(true)

    const store = useVersionStore()
    const version = store.generate(draft, JD)
    expect(draftStore.dirty).toBe(false)
    expect(version.draftRevision).toBe(before + 1)
  })

  it('keeps two versions generated from the same job description', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const first = store.generate(draft, JD)
    const second = store.generate(draft, JD)
    expect(store.versions).toHaveLength(2)
    expect(first.body).toBe(second.body)
    expect(first.id).not.toBe(second.id)
  })

  it('numbers the fallback version name after the existing versions', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const unnamed = '我们希望有个伙伴\n一起做点事情'
    store.generate(draft, unnamed)
    const second = store.generate(draft, unnamed)
    expect(store.versions[0]!.name).toBe('版本 1')
    expect(second.name).toBe('版本 2')
  })

  it('reads a version by its identifier', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const version = store.generate(draft, JD)
    expect(store.byId(version.id)?.body).toBe(version.body)
  })

  it('returns nothing for an unknown identifier', () => {
    const store = useVersionStore()
    expect(store.byId('missing')).toBeUndefined()
  })

  it('removes a version and keeps the others', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const first = store.generate(draft, JD)
    const second = store.generate(draft, JD)
    store.remove(first.id)
    expect(store.versions.map((version) => version.id)).toEqual([second.id])
  })

  it('leaves the draft untouched when a version is removed', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const version = store.generate(draft, JD)
    store.remove(version.id)
    expect(useDraftStore().draft!.revision).toBe(draft.revision)
  })

  it('refuses to generate a version while logged out', () => {
    const draft = seedDraft()
    useSessionStore().logout()
    const store = useVersionStore()
    expect(() => store.generate(draft, JD)).toThrow(/登录/)
    expect(store.versions).toHaveLength(0)
  })

  it('carries the profile into the version', () => {
    const draft = seedDraft()
    useDraftStore().updateProfile({ name: '张三', headline: '前端工程师' })
    const store = useVersionStore()
    const version = store.generate(draft, JD)
    expect(version.profile.name).toBe('张三')
    expect(version.profile.headline).toBe('前端工程师')
  })

  it('keeps the profile of an old version when the draft profile changes afterwards', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const version = store.generate(draft, JD)

    useDraftStore().updateProfile({ name: '改过的名字' })
    expect(store.byId(version.id)!.profile.name).not.toBe('改过的名字')
  })

  it('keeps the content of an old version when the draft changes afterwards', () => {
    const draft = seedDraft()
    const store = useVersionStore()
    const version = store.generate(draft, JD)
    const before = version.body
    const revisionAtGeneration = version.draftRevision

    const draftStore = useDraftStore()
    const section = draftStore.draft!.sections.find((item) => item.kind === 'experience')!
    draftStore.updateBulletText(
      section.id,
      section.items[0]!.id,
      section.items[0]!.bullets[0]!.id,
      '改写之后的要点',
    )

    expect(store.byId(version.id)!.body).toBe(before)
    expect(store.byId(version.id)!.draftRevision).toBe(revisionAtGeneration)
  })
})
