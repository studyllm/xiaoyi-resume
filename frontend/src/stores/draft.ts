import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { collectDraftIds, createIdSeed, resumeIdSeed, type IdSeed } from '@xiaoyi/shared/domain/ids'
import { FAILURE_STATES, ALL_STATES, type ActiveState } from '@xiaoyi/shared/domain/states'
import type {
  Bullet,
  Diagnosis,
  DiagnosisIssue,
  DiagnosisState,
  Draft,
  DraftContact,
  DraftItem,
  DraftProfile,
} from '@xiaoyi/shared/domain/types'
import { ApiError } from '@/api/client'
import { fetchDraft, importLocalDraft, parseResume, saveDraft } from '@/api/resume'
import { engineContext, useEngines } from './engines'
import { orderByDocument } from '@xiaoyi/shared/engines/anchor'
import { findStructureFindings, type StructureFinding } from '@xiaoyi/shared/engines/structure'
import { draftKey, persistence } from './persistence'
import { useSessionStore } from './session'

/**
 * 深拷贝草稿。Vue 的响应式代理不能被 structuredClone 克隆，
 * 草稿本身是纯 JSON 数据，用 JSON 往返即可。
 */
function cloneDraft(source: Draft): Draft {
  return JSON.parse(JSON.stringify(source)) as Draft
}

/** 把一次失败变成状态表里的一条：网络不通给「离线」，其余按服务端给的码。 */
function failureOf(error: unknown): ActiveState {
  if (error instanceof ApiError) return { state: error.state }
  return { state: FAILURE_STATES['offline'] }
}

export interface SaveOutcome {
  ok: boolean
  /** 没存成时的状态：文案与用户能做的下一步都在状态表里。 */
  failure?: ActiveState
}

/**
 * 解析的结果。
 *
 * 成功时给解析出来的那份；失败时给状态——文案与下一步都在状态表里，
 * 界面直接用，不用自己编。
 */
export type IngestOutcome =
  | {
      ok: true
      draft: Draft
      confidence: number
      warnings: string[]
      otherHeaders: string[]
    }
  | { ok: false; failure: ActiveState }

export const useDraftStore = defineStore('draft', () => {
  const draft = ref<Draft | null>(null)
  const pending = ref<Draft | null>(null)
  /** 服务端没有、本机还有一份——等用户决定搬还是丢（计划 T3.8）。 */
  const localCopyAvailable = ref(false)
  const diagnosis = ref<Diagnosis | null>(null)
  /** 最近一次保存时查出来的结构问题。编辑过程中不实时更新。 */
  const structureFindings = ref<StructureFinding[]>([])

  /** 已保存的修订号。只有保存才递增。 */
  const savedRevision = ref(0)
  /** 上次保存的内容，供「放弃修改」回退。 */
  const savedSnapshot = ref<Draft | null>(null)
  /** 是否有未保存的修改。 */
  const dirty = ref(false)
  /** 内容变更计数，每次改动 +1。与保存次数无关，用来判断诊断是否过期。 */
  const contentVersion = ref(0)

  let seed: IdSeed = createIdSeed()

  const hasDraft = computed(() => draft.value !== null)
  const diagnosisStale = computed(() => {
    if (!diagnosis.value || !draft.value) return false
    return diagnosis.value.contentVersion !== contentVersion.value
  })

  /** 诊断之后被用户改动过的要点。用来解释「改了但意见还在」。 */
  const changedBulletIds = computed(() => {
    const changed = new Set<string>()
    if (!diagnosis.value || !draft.value) return changed
    for (const issue of diagnosis.value.issues) {
      if (!issue.bulletId) continue
      const current = findBulletText(draft.value, issue.bulletId)
      if (current !== undefined && current !== issue.quote) changed.add(issue.bulletId)
    }
    return changed
  })

  function findBulletText(target: Draft, bulletId: string): string | undefined {
    for (const section of target.sections) {
      for (const item of section.items) {
        const bullet = item.bullets.find((candidate) => candidate.id === bulletId)
        if (bullet) return bullet.text
      }
    }
    return undefined
  }

  /** 意见锚点的内容是否还在。删除条目或要点后，对应的意见不再挂出来。 */
  function stillAnchored(target: Draft, issue: DiagnosisIssue): boolean {
    const section = target.sections.find((candidate) => candidate.id === issue.sectionId)
    if (!section) return false
    if (!issue.itemId) return true
    const item = section.items.find((candidate) => candidate.id === issue.itemId)
    if (!item) return false
    if (!issue.bulletId) return true
    return item.bullets.some((bullet) => bullet.id === issue.bulletId)
  }

  /** 当前还挂得住的诊断意见。 */
  const liveIssues = computed<DiagnosisIssue[]>(() => {
    const issues = diagnosis.value?.issues ?? []
    const current = draft.value
    if (!current) return issues
    return issues.filter((issue) => stillAnchored(current, issue))
  })

  /** 界面上的批注按简历位置排列。引擎内部按严重度排序，展示时换成位置顺序。 */
  const orderedIssues = computed<DiagnosisIssue[]>(() => {
    const issues = liveIssues.value
    const current = draft.value
    if (!current) return issues
    return orderByDocument(current, issues)
  })

  /** 诊断处于哪一步：还没诊断过、诊断过但没有意见、有意见。 */
  const diagnosisState = computed<DiagnosisState>(() => {
    if (!diagnosis.value) return 'none'
    return liveIssues.value.length === 0 ? 'empty' : 'result'
  })

  function isBulletChanged(bulletId: string): boolean {
    return changedBulletIds.value.has(bulletId)
  }

  /**
   * 读简历底稿。
   *
   * **服务端是权威**（ADR-0004）：先问服务端。问不到才退回本地缓存——
   * 本地那份是只读缓存，断网时还能看到上次的内容，但改不动也存不了。
   */
  async function restore(): Promise<void> {
    const run = doRestore()
    restoring = run
    try {
      await run
    } finally {
      if (restoring === run) restoring = null
    }
  }

  /** 正在进行的重载。保存前要等它完成——否则带的是旧账号的修订号。 */
  let restoring: Promise<void> | null = null

  /**
   * 等当前这次重载结束。
   *
   * 路由守卫用它：草稿是从服务端读的，刷新后还在路上。守卫不等它到就判
   * 「没有底稿」，会把刚刷新过页面的用户误送回导入页。
   */
  function whenRestored(): Promise<void> {
    return restoring ?? Promise.resolve()
  }

  async function doRestore(): Promise<void> {
    const session = useSessionStore()
    const userId = session.currentUserId
    if (!userId) {
      clear()
      return
    }

    try {
      const result = await fetchDraft()
      draft.value = result.draft
      savedRevision.value = result.revision
      savedSnapshot.value = cloneDraft(result.draft)
      dirty.value = false
      diagnosis.value = null
      seed = resumeIdSeed(collectDraftIds(result.draft))
      // 本地留一份只读缓存：断网时还能看到上次的内容
      persistence.write(draftKey(userId), result.draft)
      session.offline = false
      return
    } catch (error) {
      const notFound =
        error instanceof ApiError && !error.offline && error.code === 'RESUME_NOT_FOUND'
      if (notFound) {
        // 服务端说没有，但本机可能还有一份旧的——先问用户，不静默清掉
        const cached = persistence.read<Draft>(draftKey(userId))
        if (cached) {
          localCopyAvailable.value = true
          clear()
          return
        }
        persistence.remove(draftKey(userId))
        clear()
        return
      }
      session.offline = true
    }

    const stored = persistence.read<Draft>(draftKey(userId))
    if (!stored) {
      clear()
      return
    }
    draft.value = stored
    savedRevision.value = stored.revision
    savedSnapshot.value = cloneDraft(stored)
    dirty.value = false
    seed = resumeIdSeed(collectDraftIds(stored))
  }

  /**
   * 把本机那份搬上服务端。
   *
   * 搬完服务端那份就是权威，本机这份清掉——留在本地的 PII 残留等于没迁
   * （`docs/privacy-conclusions.md` §2）。
   */
  async function importLocalCopy(): Promise<{ ok: boolean; versions: number }> {
    const session = useSessionStore()
    const userId = session.currentUserId
    if (!userId) return { ok: false, versions: 0 }

    const cached = persistence.read<Draft>(draftKey(userId))
    if (!cached) {
      localCopyAvailable.value = false
      return { ok: false, versions: 0 }
    }

    const result = await importLocalDraft({ draft: { v: 3, data: cached } })
    persistence.remove(draftKey(userId))
    localCopyAvailable.value = false
    await restore()
    return { ok: result.draft, versions: result.versions }
  }

  /** 丢弃本机那份，不搬到服务端。 */
  function discardLocalCopy(): void {
    const userId = useSessionStore().currentUserId
    if (userId) persistence.remove(draftKey(userId))
    localCopyAvailable.value = false
    clear()
  }

  /** 清空内存里的那份，不留上一个用户的内容。 */
  function clear(): void {
    draft.value = null
    savedRevision.value = 0
    savedSnapshot.value = null
    structureFindings.value = []
    dirty.value = false
    diagnosis.value = null
    seed = createIdSeed()
  }

  /**
   * 解析简历正文，结果摆在「待保存」那一份里。
   *
   * **解析在服务端做**（契约 §4.2）：正文发给 `POST /api/v1/draft/parse`，
   * 服务端用同一份引擎源码算好再返回。纯计算不落库——用户点保存时才 PUT
   * 上去，服务端在保存时重跑结构检查做权威校验。
   */
  async function ingest(rawText: string): Promise<IngestOutcome> {
    try {
      const result = await parseResume(rawText)
      pending.value = result.draft
      // 服务端给的 id 是它那套种子续出来的——本机新增的条目要接着它续，
      // 否则会跟服务端已经用过的 id 撞号。
      seed = resumeIdSeed(collectDraftIds(result.draft))
      return {
        ok: true,
        draft: result.draft,
        confidence: result.confidence,
        warnings: result.warnings,
        otherHeaders: result.otherHeaders,
      }
    } catch (error) {
      // 失败时状态从错误码取：空正文、认不出结构、连不上服务端，各有自己的说法
      pending.value = null
      if (error instanceof ApiError && error.offline) {
        // 解析的下一步是「等它恢复后再解析一次」，不是「等连上再保存」
        return { ok: false, failure: { state: ALL_STATES['parse-unreachable']! } }
      }
      return { ok: false, failure: failureOf(error) }
    }
  }

  /** 把解析结果存为简历（导入页用）。 */
  async function savePending(options: { confirmed?: boolean } = {}): Promise<SaveOutcome> {
    // 换账号后要等按新账号的重载完成，否则带的是旧修订号，服务端会判冲突
    if (restoring) await restoring

    const session = useSessionStore()
    if (!session.isLoggedIn) {
      return { ok: false, failure: { state: FAILURE_STATES['not-logged-in'] } }
    }
    if (!pending.value) {
      return { ok: false, failure: { state: FAILURE_STATES['nothing-to-save'] } }
    }
    if (draft.value && !options.confirmed) {
      return { ok: false, failure: { state: FAILURE_STATES['confirm-overwrite'] } }
    }

    const next: Draft = {
      ...pending.value,
      userId: session.user?.id ?? draft.value?.userId ?? '',
      revision: savedRevision.value + 1,
      updatedAt: new Date().toISOString(),
    }

    const outcome = await commit(next)
    if (!outcome.ok) return outcome

    pending.value = null
    diagnosis.value = null
    return { ok: true }
  }

  /**
   * 固化当前内容：写到服务端，修订号由服务端给。
   *
   * **写不进去就不改本地状态**——内存里那份要继续标成「未保存」，
   * 用户不该看到「已保存」而其实没存上。
   */
  async function commit(next: Draft): Promise<SaveOutcome> {
    const session = useSessionStore()
    try {
      const result = await saveDraft(next, savedRevision.value)
      const saved: Draft = { ...next, revision: result.revision, updatedAt: result.savedAt }
      savedRevision.value = saved.revision
      draft.value = saved
      savedSnapshot.value = cloneDraft(saved)
      dirty.value = false
      if (session.currentUserId) persistence.write(draftKey(session.currentUserId), saved)
      contentVersion.value += 1
      session.offline = false
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError && error.offline) session.offline = true
      return { ok: false, failure: failureOf(error) }
    }
  }

  /** 保存编辑。逐字输入不会调用它。 */
  async function saveEdits(): Promise<SaveOutcome> {
    if (!draft.value) return { ok: false, failure: { state: FAILURE_STATES['nothing-to-save'] } }
    return commit({
      ...draft.value,
      revision: savedRevision.value + 1,
      updatedAt: new Date().toISOString(),
    })
  }

  /**
   * 编辑器给出了一份改过的简历：先落进内存，标成未保存。
   * 修订号与持久化仍然由保存动作负责。
   */
  function applyChange(next: Draft): void {
    draft.value = next
    touch(next)
  }

  /** 有未保存的修改时先保存。生成版本、导出 PDF 前会调用。 */
  async function saveIfDirty(): Promise<boolean> {
    if (!dirty.value) return false
    const outcome = await saveEdits()
    return outcome.ok
  }

  /** 放弃修改，回到上次保存的内容。 */
  function discardEdits(): void {
    if (!savedSnapshot.value) return
    draft.value = cloneDraft(savedSnapshot.value)
    dirty.value = false
    structureFindings.value = []
  }

  function updateProfile(patch: Partial<DraftProfile>): void {
    if (!draft.value) return
    Object.assign(draft.value.profile, patch)
    touch(draft.value)
  }

  function addContact(contact: DraftContact): void {
    if (!draft.value) return
    draft.value.profile.contacts.push({ ...contact })
    touch(draft.value)
  }

  function removeContact(index: number): void {
    if (!draft.value) return
    draft.value.profile.contacts.splice(index, 1)
    touch(draft.value)
  }

  /**
   * 保存时检查一遍结构问题，结果留给界面列清单。
   *
   * 只留缺字段与时间对不上这类要紧的：分区是空的、条目还没写要点，
   * 那是"还没填完"，在保存的时候提它只会打扰人。
   */
  function checkStructure(): StructureFinding[] {
    if (!draft.value) return []
    structureFindings.value = findStructureFindings(draft.value).filter(
      (finding) => finding.severity !== 'low',
    )
    return structureFindings.value
  }

  function diagnose(): Diagnosis {
    if (!draft.value) throw new Error('没有简历，无法诊断')
    const engines = useEngines()
    const result = engines.diagnose(draft.value, engineContext())
    diagnosis.value = { ...result, contentVersion: contentVersion.value }
    return diagnosis.value
  }

  function sectionOf(target: Draft, sectionId: string) {
    return target.sections.find((section) => section.id === sectionId)
  }

  function itemOf(target: Draft, sectionId: string, itemId: string): DraftItem | undefined {
    return sectionOf(target, sectionId)?.items.find((item) => item.id === itemId)
  }

  /** 改动只更新内存内容并标记未保存；固化由 saveEdits 负责。 */
  function touch(target: Draft): void {
    target.updatedAt = new Date().toISOString()
    dirty.value = true
    contentVersion.value += 1
  }

  function updateBulletText(
    sectionId: string,
    itemId: string,
    bulletId: string,
    text: string,
  ): void {
    if (!draft.value) return
    const bullet = itemOf(draft.value, sectionId, itemId)?.bullets.find(
      (candidate) => candidate.id === bulletId,
    )
    if (!bullet) return
    bullet.text = text
    touch(draft.value)
  }

  function addBullet(sectionId: string, itemId: string): Bullet | null {
    if (!draft.value) return null
    const item = itemOf(draft.value, sectionId, itemId)
    if (!item) return null
    const bullet: Bullet = { id: seed.next('bullet'), text: '' }
    item.bullets.push(bullet)
    touch(draft.value)
    return bullet
  }

  function removeBullet(sectionId: string, itemId: string, bulletId: string): void {
    if (!draft.value) return
    const item = itemOf(draft.value, sectionId, itemId)
    if (!item) return
    item.bullets = item.bullets.filter((bullet) => bullet.id !== bulletId)
    touch(draft.value)
  }

  function updateItemMeta(
    sectionId: string,
    itemId: string,
    patch: Partial<Pick<DraftItem, 'org' | 'title' | 'start' | 'end' | 'present'>>,
  ): void {
    if (!draft.value) return
    const item = itemOf(draft.value, sectionId, itemId)
    if (!item) return
    Object.assign(item, patch)
    touch(draft.value)
  }

  function addItem(sectionId: string): DraftItem | null {
    if (!draft.value) return null
    const section = sectionOf(draft.value, sectionId)
    if (!section) return null
    const item: DraftItem = { id: seed.next('item'), bullets: [] }
    section.items.push(item)
    touch(draft.value)
    return item
  }

  function removeItem(sectionId: string, itemId: string): void {
    if (!draft.value) return
    const section = sectionOf(draft.value, sectionId)
    if (!section) return
    section.items = section.items.filter((item) => item.id !== itemId)
    touch(draft.value)
  }

  /**
   * 解析结果被改动了。解析结果只是暂存，没有修订号与未保存那一套，
   * 所以这里只整体替换。
   */
  function applyPendingChange(next: Draft): void {
    pending.value = next
  }

  function addPendingBullet(sectionId: string, itemId: string): void {
    if (!pending.value) return
    const item = itemOf(pending.value, sectionId, itemId)
    if (!item) return
    item.bullets.push({ id: seed.next('bullet'), text: '' })
  }

  function removePendingBullet(sectionId: string, itemId: string, bulletId: string): void {
    if (!pending.value) return
    const item = itemOf(pending.value, sectionId, itemId)
    if (!item) return
    item.bullets = item.bullets.filter((bullet) => bullet.id !== bulletId)
  }

  function discardPending(): void {
    pending.value = null
  }

  /**
   * 清掉诊断结果。依附于意见的「已改」标记由 diagnosis 一并带走。
   * 用户对每条意见的已处理与已忽略标记在 uiStore 里，由调用方一并清。
   */
  function clearDiagnosis(): void {
    diagnosis.value = null
  }

  return {
    draft,
    pending,
    localCopyAvailable,
    importLocalCopy,
    discardLocalCopy,
    diagnosis,
    savedRevision,
    savedSnapshot,
    dirty,
    contentVersion,
    hasDraft,
    diagnosisStale,
    changedBulletIds,
    isBulletChanged,
    liveIssues,
    orderedIssues,
    diagnosisState,
    structureFindings,
    restore,
    whenRestored,
    ingest,
    savePending,
    saveEdits,
    saveIfDirty,
    applyChange,
    discardEdits,
    diagnose,
    checkStructure,
    updateProfile,
    addContact,
    removeContact,
    updateBulletText,
    addBullet,
    removeBullet,
    updateItemMeta,
    addItem,
    removeItem,
    applyPendingChange,
    addPendingBullet,
    removePendingBullet,
    discardPending,
    clearDiagnosis,
  }
})
