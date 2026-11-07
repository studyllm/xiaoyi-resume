import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Draft } from '@xiaoyi/shared/domain/types'
import { anchorText } from '@xiaoyi/shared/engines/anchor'
import { useDraftStore } from './draft'
import { useSessionStore } from './session'

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


const RESUME = `工作经历
美团 前端工程师 2021.03 - 至今
· 负责公司营销活动页面的前端开发，配合设计团队完成活动上线
· 主导活动平台前端架构升级，页面构建时间从 120s 降到 18s

专业技能
前端：Vue、React、TypeScript
`

/** 四个分区都填满、每条要点都有结果信号，因此诊断查不出任何问题。 */
const CLEAN_RESUME = `教育背景
清华大学 计算机科学与技术 2014.09 - 2018.06
· 主修数据结构与操作系统原理

工作经历
美团 前端工程师 2021.03 - 至今
· 主导活动平台前端架构升级，页面构建时间从 120s 降到 18s

项目经历
活动平台重构 2022.03 - 2022.12
· 用 Vue 3 重构活动平台，首屏时间从 3s 降到 1.2s

专业技能
前端：Vue、React、TypeScript
`

function sectionIdOf(draft: Draft, kind: string): string {
  return draft.sections.find((section) => section.kind === kind)!.id
}

function itemIdOf(draft: Draft, kind: string): string {
  return draft.sections.find((section) => section.kind === kind)!.items[0]!.id
}

describe('useDraftStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    { const s = useSessionStore(); s.user = { id: 'user-张三', email: 'zhang@example.com' }; s.status = 'user' }
  })

  it('starts without a draft', async () => {
    const store = useDraftStore()
    expect(store.hasDraft).toBe(false)
    expect(store.draft).toBeNull()
  })

  it('parses pasted text into a staged draft', async () => {
    const store = useDraftStore()
    const result = store.ingest(RESUME)
    expect(result.ok).toBe(true)
    expect(store.pending).not.toBeNull()
    expect(store.hasDraft).toBe(false)
  })

  it('rejects empty text', async () => {
    const store = useDraftStore()
    const result = store.ingest('   ')
    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('empty')
  })

  it('saves the staged draft', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    const outcome = await store.savePending()
    expect(outcome.ok).toBe(true)
    expect(store.hasDraft).toBe(true)
    expect(store.pending).toBeNull()
  })

  it('refuses to overwrite an existing draft without a confirmation', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.ingest(RESUME)
    const outcome = await store.savePending()
    expect(outcome.ok).toBe(false)
    expect(outcome.failure?.state.title).toContain('覆盖')
  })

  it('overwrites an existing draft once the overwrite is confirmed', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.ingest(RESUME)
    const outcome = await store.savePending({ confirmed: true })
    expect(outcome.ok).toBe(true)
  })

  it('does not increment the revision while the change is unsaved', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const before = store.draft!.revision
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.draft!.revision).toBe(before)
    expect(store.dirty).toBe(true)
  })

  it('increments the revision once when the changes are saved', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const before = store.draft!.revision

    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.draft!.revision).toBe(before)

    await store.saveEdits()
    expect(store.draft!.revision).toBe(before + 1)
    expect(store.dirty).toBe(false)
  })

  it('restores the last saved content when the changes are discarded', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const sectionId = sectionIdOf(store.draft!, 'experience')
    const itemId = itemIdOf(store.draft!, 'experience')
    const bulletId = store.draft!.sections
      .find((section) => section.id === sectionId)!
      .items[0]!.bullets[0]!.id
    const savedText = store.draft!.sections
      .find((section) => section.id === sectionId)!
      .items[0]!.bullets[0]!.text

    store.updateBulletText(sectionId, itemId, bulletId, '改过的内容')
    expect(store.dirty).toBe(true)

    store.discardEdits()
    expect(store.dirty).toBe(false)
    expect(
      store.draft!.sections.find((section) => section.id === sectionId)!.items[0]!.bullets[0]!.text,
    ).toBe(savedText)
  })

  it('saves automatically when there are unsaved changes', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const before = store.draft!.revision

    store.updateProfile({ name: '李四' })
    expect(await store.saveIfDirty()).toBe(true)
    expect(store.draft!.revision).toBe(before + 1)
    expect(store.dirty).toBe(false)
  })

  it('keeps the identifier of a bullet when its text changes', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const bulletId = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets[0]!.id
    store.updateBulletText(
      sectionIdOf(store.draft!, 'experience'),
      itemIdOf(store.draft!, 'experience'),
      bulletId,
      '改写后的要点',
    )
    const updated = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets[0]!
    expect(updated.id).toBe(bulletId)
    expect(updated.text).toBe('改写后的要点')
  })

  it('gives a new bullet a fresh identifier', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const before = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets.map((bullet) => bullet.id)
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    const after = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets.map((bullet) => bullet.id)
    expect(after.length).toBe(before.length + 1)
    expect(new Set(after).size).toBe(after.length)
  })

  it('removes a bullet', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const bulletId = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets[0]!.id
    store.removeBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'), bulletId)
    const bullets = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets
    expect(bullets.map((bullet) => bullet.id)).not.toContain(bulletId)
  })

  it('adds and removes an entry', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.addItem(sectionIdOf(store.draft!, 'project'))
    const items = store.draft!.sections.find((section) => section.kind === 'project')!.items
    expect(items).toHaveLength(1)
    store.removeItem(sectionIdOf(store.draft!, 'project'), items[0]!.id)
    expect(store.draft!.sections.find((section) => section.kind === 'project')!.items).toHaveLength(0)
  })

  it('drops the comments of a removed bullet', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.diagnose()
    const bulletIssue = store.diagnosis!.issues.find((issue) => issue.bulletId)
    expect(bulletIssue).toBeDefined()

    store.removeBullet(
      sectionIdOf(store.draft!, 'experience'),
      itemIdOf(store.draft!, 'experience'),
      bulletIssue!.bulletId,
    )
    expect(store.liveIssues.some((issue) => issue.id === bulletIssue!.id)).toBe(false)
  })

  it('drops the comments of a removed entry', async () => {
    const store = useDraftStore()
    store.ingest('工作经历\n美团 前端工程师\n· 负责活动页面的前端开发\n')
    await store.savePending()
    store.diagnose()
    const itemIssue = store.diagnosis!.issues.find((issue) => issue.itemId && !issue.bulletId)
    expect(itemIssue).toBeDefined()

    store.removeItem(sectionIdOf(store.draft!, 'experience'), itemIssue!.itemId)
    expect(store.liveIssues.some((issue) => issue.id === itemIssue!.id)).toBe(false)
  })

  it('keeps the comments that are still anchored to the content', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.diagnose()
    expect(store.liveIssues.length).toBe(store.diagnosis!.issues.length)
  })

  it('orders the comments by where they sit in the resume, not by severity', async () => {
    const store = useDraftStore()
    store.ingest(
      '工作经历\n甲公司 前端工程师 2021.03 - 2023.01\n· 参与团队协作与日常维护\n乙公司 高级工程师 2023.02 - 至今\n· 负责后端服务开发\n',
    )
    await store.savePending()
    const section = store.draft!.sections.find((entry) => entry.kind === 'experience')!
    store.updateItemMeta(section.id, section.items[1]!.id, { start: null })
    store.diagnose()

    // 引擎按严重度排：缺开始时间是「高」，排在最前
    expect(store.liveIssues[0]!.ruleId).toBe('missing-start')

    // 界面按简历位置排：它在后面，就排在后面
    const anchors = store.orderedIssues.map((issue) => anchorText(issue))
    const earlier = anchors.findIndex((anchor) => anchor.includes('参与团队协作'))
    const later = anchors.findIndex((anchor) => anchor.includes('乙公司'))
    expect(earlier).toBeGreaterThanOrEqual(0)
    expect(later).toBeGreaterThan(earlier)
  })

  it('stores the months of an entry in a single format', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.updateItemMeta(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'), {
      start: '2021-03',
      end: '2022-08',
    })
    const item = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!
    expect(item.start).toBe('2021-03')
    expect(item.end).toBe('2022-08')
  })

  it('marks the diagnosis as stale once the draft changes', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.diagnose()
    expect(store.diagnosisStale).toBe(false)
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.diagnosisStale).toBe(true)
  })

  it('keeps the diagnosis attached to the revision it was made on', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    const diagnosis = store.diagnose()
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.diagnosis!.draftRevision).toBe(diagnosis.draftRevision)
  })

  it('does not report a stale diagnosis as fresh', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.diagnose()
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.diagnosisStale).toBe(true)
  })

  it('refuses to save while logged out', async () => {
    { const s = useSessionStore(); s.user = null; s.status = 'guest' }
    const store = useDraftStore()
    store.ingest(RESUME)
    const outcome = await store.savePending()
    expect(outcome.ok).toBe(false)
    expect(outcome.failure?.state.title).toContain('登录')
    expect(store.hasDraft).toBe(false)
  })

  it('keeps the profile that was parsed from the resume header', async () => {
    const store = useDraftStore()
    store.ingest('张三\n前端工程师 · 6 年经验\n手机：138-0000-0000\n\n工作经历\n美团 前端工程师 2021.03 - 至今\n· 负责活动页开发')
    await store.savePending()
    expect(store.draft!.profile.name).toBe('张三')
    expect(store.draft!.profile.headline).toBe('前端工程师 · 6 年经验')
    expect(store.draft!.profile.contacts).toEqual([{ label: '手机', value: '138-0000-0000' }])
  })

  it('saves an edited profile', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()

    store.updateProfile({ name: '李四', headline: '后端工程师' })
    expect(store.draft!.profile.name).toBe('李四')
    expect(store.draft!.profile.headline).toBe('后端工程师')
    expect(store.dirty).toBe(true)
  })

  it('adds and removes a contact', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()

    store.addContact({ label: '邮箱', value: 'a@example.com' })
    expect(store.draft!.profile.contacts).toHaveLength(1)

    store.removeContact(0)
    expect(store.draft!.profile.contacts).toHaveLength(0)
  })

  it('does not let the user edit the staged result through the saved draft', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    const pending = store.pending!
    const section = pending.sections.find((entry) => entry.kind === 'experience')!
    const item = section.items[0]!
    store.applyPendingChange({
      ...pending,
      sections: pending.sections.map((entry) =>
        entry.kind === 'experience'
          ? {
              ...entry,
              items: [
                {
                  ...item,
                  bullets: [{ ...item.bullets[0]!, text: '改过的要点' }, ...item.bullets.slice(1)],
                },
              ],
            }
          : entry,
      ),
    })

    expect(
      store.pending!.sections
        .find((entry) => entry.kind === 'experience')!
        .items[0]!.bullets[0]!.text,
    ).toBe('改过的要点')
    expect(store.draft).toBeNull()
  })

  it('清空诊断结果会带走依附于它的已改标记', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    store.diagnose()

    const bulletIssue = store.diagnosis!.issues.find((issue) => issue.bulletId)!
    store.updateBulletText(
      sectionIdOf(store.draft!, 'experience'),
      itemIdOf(store.draft!, 'experience'),
      bulletIssue.bulletId,
      '改过的要点',
    )
    expect(store.isBulletChanged(bulletIssue.bulletId)).toBe(true)

    store.clearDiagnosis()

    expect(store.diagnosis).toBeNull()
    expect(store.isBulletChanged(bulletIssue.bulletId)).toBe(false)
  })

  it('说得出诊断走到了哪一步', async () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
    expect(store.diagnosisState).toBe('none')

    store.diagnose()
    expect(store.diagnosisState).toBe('result')

    store.clearDiagnosis()
    expect(store.diagnosisState).toBe('none')
  })

  it('诊断查不出问题时是空状态而不是有意见', async () => {
    const store = useDraftStore()
    store.ingest(CLEAN_RESUME)
    await store.savePending()
    store.diagnose()

    expect(store.diagnosis!.issues).toHaveLength(0)
    expect(store.diagnosisState).toBe('empty')
  })
})

describe('简历按人分槽', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function saveAs(name: string): Promise<void> {
    const session = useSessionStore()
    session.user = { id: `user-${name}`, email: `${name}@example.com` }; session.status = 'user'
    const store = useDraftStore()
    store.ingest(RESUME)
    await store.savePending()
  }

  it('换一个名字读到的是空白的一份', async () => {
    const session = useSessionStore()
    const store = useDraftStore()
    await saveAs('张三')
    expect(store.hasDraft).toBe(true)

    session.user = { id: 'user-李四', email: '李四@example.com' }; session.status = 'user'
    await store.restore()

    expect(store.hasDraft).toBe(false)
    expect(store.draft).toBeNull()
  })

  it('换回原来的名字，那份简历还在', async () => {
    const session = useSessionStore()
    const store = useDraftStore()
    await saveAs('张三')

    session.user = { id: 'user-李四', email: '李四@example.com' }; session.status = 'user'
    await store.restore()
    expect(store.hasDraft).toBe(false)

    session.user = { id: 'user-张三', email: '张三@example.com' }; session.status = 'user'
    await store.restore()
    expect(store.hasDraft).toBe(true)
    expect(
      store.draft!.sections.find((section) => section.kind === 'experience')!.items[0]!.org,
    ).toBe('美团')
  })

  it('退出登录后不再载入那份简历', async () => {
    const session = useSessionStore()
    const store = useDraftStore()
    await saveAs('张三')

    { session.user = null; session.status = 'guest' }
    await store.restore()

    // 退出就是真的退出：落地页回到「导入我的简历」的样子
    expect(store.hasDraft).toBe(false)
    expect(store.draft).toBeNull()
  })
})
