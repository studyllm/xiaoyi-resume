import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Draft } from '@/domain/types'
import { anchorText } from '@/engines/anchor'
import { useDraftStore } from './draft'
import { useSessionStore } from './session'

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
    useSessionStore().login('张三')
  })

  it('starts without a draft', () => {
    const store = useDraftStore()
    expect(store.hasDraft).toBe(false)
    expect(store.draft).toBeNull()
  })

  it('parses pasted text into a staged draft', () => {
    const store = useDraftStore()
    const result = store.ingest(RESUME)
    expect(result.ok).toBe(true)
    expect(store.pending).not.toBeNull()
    expect(store.hasDraft).toBe(false)
  })

  it('rejects empty text', () => {
    const store = useDraftStore()
    const result = store.ingest('   ')
    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('empty')
  })

  it('saves the staged draft', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    const outcome = store.savePending()
    expect(outcome.ok).toBe(true)
    expect(store.hasDraft).toBe(true)
    expect(store.pending).toBeNull()
  })

  it('refuses to overwrite an existing draft without a confirmation', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    store.ingest(RESUME)
    const outcome = store.savePending()
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toContain('覆盖')
  })

  it('overwrites an existing draft once the overwrite is confirmed', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    store.ingest(RESUME)
    const outcome = store.savePending({ confirmed: true })
    expect(outcome.ok).toBe(true)
  })

  it('does not increment the revision while the change is unsaved', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    const before = store.draft!.revision
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.draft!.revision).toBe(before)
    expect(store.dirty).toBe(true)
  })

  it('increments the revision once when the changes are saved', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    const before = store.draft!.revision

    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.draft!.revision).toBe(before)

    store.saveEdits()
    expect(store.draft!.revision).toBe(before + 1)
    expect(store.dirty).toBe(false)
  })

  it('restores the last saved content when the changes are discarded', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
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

  it('saves automatically when there are unsaved changes', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    const before = store.draft!.revision

    store.updateProfile({ name: '李四' })
    expect(store.saveIfDirty()).toBe(true)
    expect(store.draft!.revision).toBe(before + 1)
    expect(store.dirty).toBe(false)
  })

  it('keeps the identifier of a bullet when its text changes', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
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

  it('gives a new bullet a fresh identifier', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
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

  it('removes a bullet', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    const bulletId = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets[0]!.id
    store.removeBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'), bulletId)
    const bullets = store.draft!.sections
      .find((section) => section.kind === 'experience')!
      .items[0]!.bullets
    expect(bullets.map((bullet) => bullet.id)).not.toContain(bulletId)
  })

  it('adds and removes an entry', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    store.addItem(sectionIdOf(store.draft!, 'project'))
    const items = store.draft!.sections.find((section) => section.kind === 'project')!.items
    expect(items).toHaveLength(1)
    store.removeItem(sectionIdOf(store.draft!, 'project'), items[0]!.id)
    expect(store.draft!.sections.find((section) => section.kind === 'project')!.items).toHaveLength(0)
  })

  it('drops the comments of a removed bullet', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
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

  it('drops the comments of a removed entry', () => {
    const store = useDraftStore()
    store.ingest('工作经历\n美团 前端工程师\n· 负责活动页面的前端开发\n')
    store.savePending()
    store.diagnose()
    const itemIssue = store.diagnosis!.issues.find((issue) => issue.itemId && !issue.bulletId)
    expect(itemIssue).toBeDefined()

    store.removeItem(sectionIdOf(store.draft!, 'experience'), itemIssue!.itemId)
    expect(store.liveIssues.some((issue) => issue.id === itemIssue!.id)).toBe(false)
  })

  it('keeps the comments that are still anchored to the content', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    store.diagnose()
    expect(store.liveIssues.length).toBe(store.diagnosis!.issues.length)
  })

  it('orders the comments by where they sit in the resume, not by severity', () => {
    const store = useDraftStore()
    store.ingest(
      '工作经历\n甲公司 前端工程师 2021.03 - 2023.01\n· 参与团队协作与日常维护\n乙公司 高级工程师 2023.02 - 至今\n· 负责后端服务开发\n',
    )
    store.savePending()
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

  it('stores the months of an entry in a single format', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
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

  it('marks the diagnosis as stale once the draft changes', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    store.diagnose()
    expect(store.diagnosisStale).toBe(false)
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.diagnosisStale).toBe(true)
  })

  it('keeps the diagnosis attached to the revision it was made on', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    const diagnosis = store.diagnose()
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.diagnosis!.draftRevision).toBe(diagnosis.draftRevision)
  })

  it('does not report a stale diagnosis as fresh', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    store.diagnose()
    store.addBullet(sectionIdOf(store.draft!, 'experience'), itemIdOf(store.draft!, 'experience'))
    expect(store.diagnosisStale).toBe(true)
  })

  it('refuses to save while logged out', () => {
    useSessionStore().logout()
    const store = useDraftStore()
    store.ingest(RESUME)
    const outcome = store.savePending()
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toContain('登录')
    expect(store.hasDraft).toBe(false)
  })

  it('keeps the profile that was parsed from the resume header', () => {
    const store = useDraftStore()
    store.ingest('张三\n前端工程师 · 6 年经验\n手机：138-0000-0000\n\n工作经历\n美团 前端工程师 2021.03 - 至今\n· 负责活动页开发')
    store.savePending()
    expect(store.draft!.profile.name).toBe('张三')
    expect(store.draft!.profile.headline).toBe('前端工程师 · 6 年经验')
    expect(store.draft!.profile.contacts).toEqual([{ label: '手机', value: '138-0000-0000' }])
  })

  it('saves an edited profile', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()

    store.updateProfile({ name: '李四', headline: '后端工程师' })
    expect(store.draft!.profile.name).toBe('李四')
    expect(store.draft!.profile.headline).toBe('后端工程师')
    expect(store.dirty).toBe(true)
  })

  it('adds and removes a contact', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()

    store.addContact({ label: '邮箱', value: 'a@example.com' })
    expect(store.draft!.profile.contacts).toHaveLength(1)

    store.removeContact(0)
    expect(store.draft!.profile.contacts).toHaveLength(0)
  })

  it('does not let the user edit the staged result through the saved draft', () => {
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

  it('清空诊断结果会带走依附于它的已改标记', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
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

  it('说得出诊断走到了哪一步', () => {
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
    expect(store.diagnosisState).toBe('none')

    store.diagnose()
    expect(store.diagnosisState).toBe('result')

    store.clearDiagnosis()
    expect(store.diagnosisState).toBe('none')
  })

  it('诊断查不出问题时是空状态而不是有意见', () => {
    const store = useDraftStore()
    store.ingest(CLEAN_RESUME)
    store.savePending()
    store.diagnose()

    expect(store.diagnosis!.issues).toHaveLength(0)
    expect(store.diagnosisState).toBe('empty')
  })
})

describe('简历按人分槽', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function saveAs(name: string): void {
    const session = useSessionStore()
    session.login(name)
    const store = useDraftStore()
    store.ingest(RESUME)
    store.savePending()
  }

  it('换一个名字读到的是空白的一份', () => {
    const session = useSessionStore()
    const store = useDraftStore()
    saveAs('张三')
    expect(store.hasDraft).toBe(true)

    session.login('李四')
    store.restore()

    expect(store.hasDraft).toBe(false)
    expect(store.draft).toBeNull()
  })

  it('换回原来的名字，那份简历还在', () => {
    const session = useSessionStore()
    const store = useDraftStore()
    saveAs('张三')

    session.login('李四')
    store.restore()
    expect(store.hasDraft).toBe(false)

    session.login('张三')
    store.restore()
    expect(store.hasDraft).toBe(true)
    expect(
      store.draft!.sections.find((section) => section.kind === 'experience')!.items[0]!.org,
    ).toBe('美团')
  })

  it('退出登录后不再载入那份简历', () => {
    const session = useSessionStore()
    const store = useDraftStore()
    saveAs('张三')

    session.logout()
    store.restore()

    // 退出就是真的退出：落地页回到「导入我的简历」的样子
    expect(store.hasDraft).toBe(false)
    expect(store.draft).toBeNull()
  })
})
