// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import router from './index'

const RESUME = `工作经历
美团 前端工程师 2021.03 - 至今
· 主导活动平台前端架构升级，页面构建时间从 120s 降到 18s
`

/** 等路由守卫跑到等待选择那一步。 */
async function flushGuard(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function setupDirtyDraft() {
  const draftStore = useDraftStore()
  draftStore.ingest(RESUME)
  draftStore.savePending()
  draftStore.updateProfile({ name: '临时改动' })
  return draftStore
}

describe('路由离开时的未保存提示', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    useSessionStore().login('张三')
    await router.push('/')
  })

  it('留在本页时不离开，也不改动内容', async () => {
    const draftStore = setupDirtyDraft()
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
    const draftStore = setupDirtyDraft()
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
    const draftStore = setupDirtyDraft()
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
    const draftStore = setupDirtyDraft()
    await router.push('/draft')
    draftStore.saveEdits()

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
