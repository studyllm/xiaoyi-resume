<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import PaperField from '@/components/PaperField.vue'
import ResumePreview, { type PreviewHighlight } from '@/components/ResumePreview.vue'
import { collectDraftIds, resumeIdSeed } from '@xiaoyi/shared/domain/ids'
import { SECTION_FIELD_WORDS } from '@xiaoyi/shared/domain/sectionFields'
import { anchorText } from '@xiaoyi/shared/engines/anchor'
import { addSkillRow, applyOp, isEmptyItem } from '@xiaoyi/shared/engines/editing'
import { hasItemHead, type DiagnosisIssue, type Draft, type DraftProfile, type SectionKind } from '@xiaoyi/shared/domain/types'

/** 外部让编辑器定位到某个地方。 */
export type EditorFocusTarget =
  | { type: 'bullet'; id: string }
  | { type: 'item'; id: string }
  | { type: 'section'; id: string }
  | { type: 'comment'; id: string }
  | { type: 'field'; sectionId: string; itemId: string; field: 'org' | 'title' | 'start' | 'end' }

const props = withDefaults(
  defineProps<{
    draft: Draft
    /** 诊断意见。缺省时纸面上没有行内批注。 */
    issues?: DiagnosisIssue[]
    editable?: boolean
    focusTarget?: EditorFocusTarget | null
  }>(),
  {
    issues: () => [],
    editable: false,
    focusTarget: null,
  },
)

const emit = defineEmits<{
  /** 内容变了，给出变更之后的简历 */
  change: [draft: Draft]
  /** 用户点了纸面上的批注或结构标注 */
  'select-comment': [issue: DiagnosisIssue]
  /** 用户按了 Cmd/Ctrl+Enter */
  'save-request': []
}>()

/** 编辑中的简历。父组件传进来的那份是起点，改动先落在这里，再发给父组件。 */
const localDraft = ref<Draft>(props.draft)
watch(
  () => props.draft,
  (next) => {
    if (next !== localDraft.value) localDraft.value = next
  },
)

const editable = computed(() => props.editable)

/**
 * 新对象的标识由这里出，不跟被删掉的撞上。
 * 换一份 draft（比如重新解析）就重建一次，否则旧的编号会跟新的一份撞车。
 */
const seed = ref(resumeIdSeed(collectDraftIds(props.draft)))
watch(
  () => props.draft,
  (next) => {
    seed.value = resumeIdSeed(collectDraftIds(next))
  },
)

/** 把改动落到本地这份简历上，并告诉父组件。 */
function commit(next: Draft): void {
  localDraft.value = next
  emit('change', next)
}

/** 诊断意见在纸上的高亮，规则与诊断页一致。 */
const highlights = computed<PreviewHighlight[]>(() =>
  props.issues.map((issue) => ({
    sectionId: issue.sectionId,
    itemId: issue.itemId || undefined,
    bulletId: issue.bulletId || undefined,
    fragment: issue.bulletId ? anchorText(issue) : undefined,
    severity: issue.severity,
  })),
)

/** 按锚点把批注挂到要点上。 */
const bulletIssues = computed(() => {
  const map = new Map<string, DiagnosisIssue[]>()
  for (const issue of props.issues) {
    if (!issue.bulletId) continue
    map.set(issue.bulletId, [...(map.get(issue.bulletId) ?? []), issue])
  }
  return map
})

/** 正在编辑的那条要点。 */
const editingBulletId = ref<string | null>(null)
/** 等待聚焦的条目与要点。 */
const pendingFocus = ref<{ kind: 'item' | 'bullet'; id: string } | null>(null)
/** 已进入二次确认的删除目标。 */
const confirmingDelete = ref<string | null>(null)
/** 展开了的批注。 */
const expandedCommentIds = ref<string[]>([])

const SECTION_ADD_LABELS: Record<SectionKind, string> = {
  education: '新增一段教育经历',
  experience: '新增一段工作经历',
  project: '新增一个项目',
  skills: '新增一条技能',
  other: '新增一条',
}

function fieldLabel(section: SectionKind, key: 'org' | 'title'): string {
  return SECTION_FIELD_WORDS[section]?.[key] ?? ''
}

/** 这一条叫什么：这段经历 / 这段教育经历 / 这个项目。 */
function itemNoun(section: SectionKind): string {
  return SECTION_FIELD_WORDS[section]?.itemNoun ?? '这一条'
}
function addLabel(section: SectionKind): string {
  return SECTION_ADD_LABELS[section] ?? '新增'
}

/** 点开一条要点，直接把光标放进输入框。 */
async function startEdit(bulletId: string): Promise<void> {
  editingBulletId.value = bulletId
  pendingFocus.value = { kind: 'bullet', id: bulletId }
  await focusPending()
}

function editBullet(sectionId: string, itemId: string, bulletId: string, event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value
  commit(
    applyOp(localDraft.value, {
      type: 'set-bullet-text',
      sectionId,
      itemId,
      bulletId,
      text: value,
    }),
  )
}

/** 新增一个条目；专业技能分区没有条目层，落在要点上。 */
async function addEntry(section: SectionKind, sectionId: string): Promise<void> {
  if (!hasItemHead(section)) {
    const bulletId = seed.value.next('bullet')
    const itemId = seed.value.next('item')
    commit(addSkillRow(localDraft.value, { sectionId, itemId, bulletId }))
    editingBulletId.value = bulletId
    pendingFocus.value = { kind: 'bullet', id: bulletId }
    await focusPending()
    return
  }

  const itemId = seed.value.next('item')
  commit(applyOp(localDraft.value, { type: 'add-item', sectionId, itemId }))
  pendingFocus.value = { kind: 'item', id: itemId }
  await focusPending()
}

async function addBulletToItem(sectionId: string, itemId: string): Promise<void> {
  const bulletId = seed.value.next('bullet')
  commit(applyOp(localDraft.value, { type: 'add-bullet', sectionId, itemId, bulletId }))
  editingBulletId.value = bulletId
  pendingFocus.value = { kind: 'bullet', id: bulletId }
  await focusPending()
}

async function focusPending(): Promise<void> {
  const target = pendingFocus.value
  if (!target) return
  pendingFocus.value = null
  await nextTick()
  if (target.kind === 'item') {
    const element = document.getElementById(`anchor-item-${target.id}`)
    element?.querySelector('input')?.focus()
    return
  }
  document.getElementById(`bullet-input-${target.id}`)?.focus()
}

function requestDelete(target: string): void {
  confirmingDelete.value = target
}

function cancelDelete(): void {
  confirmingDelete.value = null
}

function confirmDelete(sectionId: string, itemId: string, bulletId?: string): void {
  if (bulletId) {
    commit(applyOp(localDraft.value, { type: 'remove-bullet', sectionId, itemId, bulletId }))
  } else {
    commit(applyOp(localDraft.value, { type: 'remove-item', sectionId, itemId }))
  }
  confirmingDelete.value = null
}

/** 空要点失焦后仍为空则移除，不在纸上留空壳。 */
function onBulletBlur(sectionId: string, itemId: string, bulletId: string, text: string): void {
  if (text.trim()) return
  commit(applyOp(localDraft.value, { type: 'remove-bullet', sectionId, itemId, bulletId }))
  editingBulletId.value = null
}

/** 空条目失焦后仍为空则移除。 */
function onItemBlur(sectionId: string, itemId: string): void {
  setTimeout(() => {
    const active = document.activeElement as HTMLElement | null
    if (active?.closest('[data-item-id]')?.getAttribute('data-item-id') === itemId) return
    const item = localDraft.value.sections
      .find((section) => section.id === sectionId)
      ?.items.find((entry) => entry.id === itemId)
    if (!item) return
    if (isEmptyItem(item)) {
      commit(applyOp(localDraft.value, { type: 'remove-item', sectionId, itemId }))
    }
  }, 0)
}

function onBulletKeydown(
  event: KeyboardEvent,
  sectionId: string,
  itemId: string,
  bulletId: string,
): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
    event.preventDefault()
    void addBulletToItem(sectionId, itemId)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    const bullet = localDraft.value.sections
      .find((section) => section.id === sectionId)
      ?.items.find((entry) => entry.id === itemId)
      ?.bullets.find((entry) => entry.id === bulletId)
    if (bullet?.text.trim()) {
      ;(event.target as HTMLElement).blur()
      editingBulletId.value = null
      return
    }
    commit(applyOp(localDraft.value, { type: 'remove-bullet', sectionId, itemId, bulletId }))
    editingBulletId.value = null
  }
}

/** Esc 取消当前这条空的条目；条目已有内容则只是退出输入。 */
function cancelEmptyItem(): void {
  const active = document.activeElement as HTMLElement | null
  const holder = active?.closest('[data-item-id]')
  const itemId = holder?.getAttribute('data-item-id')
  const sectionId = holder?.closest('[data-section-id]')?.getAttribute('data-section-id')
  if (!itemId || !sectionId) return

  const item = localDraft.value.sections
    .find((section) => section.id === sectionId)
    ?.items.find((entry) => entry.id === itemId)
  if (!item) return

  if (isEmptyItem(item)) {
    commit(applyOp(localDraft.value, { type: 'remove-item', sectionId, itemId }))
    return
  }
  active?.blur()
}

/** 纸上的键盘流：Cmd/Ctrl+Enter 请父组件保存，Esc 取消空条目。 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    emit('save-request')
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEmptyItem()
  }
}

function updateProfile(patch: Partial<DraftProfile>): void {
  commit(applyOp(localDraft.value, { type: 'set-profile', patch }))
}

/** 条目的起止时间或「至今」改了。 */
function onItemDatesUpdate(
  sectionId: string,
  itemId: string,
  patch: { start?: string | null; end?: string | null; present?: boolean },
): void {
  updateItemMeta(sectionId, itemId, patch)
}

function updateItemMeta(
  sectionId: string,
  itemId: string,
  patch: { org?: string; title?: string; start?: string | null; end?: string | null; present?: boolean },
): void {
  commit(applyOp(localDraft.value, { type: 'set-item-meta', sectionId, itemId, patch }))
}

function addContact(): void {
  commit(applyOp(localDraft.value, { type: 'add-contact', contact: { label: '', value: '' } }))
}

function removeContact(index: number): void {
  commit(applyOp(localDraft.value, { type: 'remove-contact', index }))
}

/** 联系方式的删除目标，与条目、要点分开。 */
function contactKey(index: number): string {
  return `contact-${index}`
}

/** 联系方式的标签与内容改了。 */
function onContactUpdate(index: number, patch: { label?: string; value?: string }): void {
  setContact(index, patch)
}

/** 正在确认删除的是第几个联系方式——-1 表示没有。 */
const confirmingContactIndex = computed(() => {
  const key = confirmingDelete.value
  if (!key || !key.startsWith('contact-')) return -1
  return Number(key.slice('contact-'.length))
})

/** 点了联系方式后面的垃圾桶——先进入确认态。 */
function requestContactDelete(index: number): void {
  requestDelete(contactKey(index))
}

function confirmDeleteContact(index: number): void {
  removeContact(index)
  confirmingDelete.value = null
}

function setContact(index: number, patch: { label?: string; value?: string }): void {
  const contacts = localDraft.value.profile.contacts.map((contact, i) =>
    i === index ? { ...contact, ...patch } : contact,
  )
  commit(applyOp(localDraft.value, { type: 'set-profile', patch: { contacts } }))
}

/** 选中一条批注，纸面与批注栏一起定位到它。 */
function revealComment(issue: DiagnosisIssue): void {
  emit('select-comment', issue)
}

function bulletCommentIds(bulletId: string): string[] {
  return (bulletIssues.value.get(bulletId) ?? []).map((issue) => issue.id)
}

/** 这条要点下的批注是不是展开了。 */
function bulletCommentsExpanded(bulletId: string): boolean {
  return bulletCommentIds(bulletId).some((id) => expandedCommentIds.value.includes(id))
}

function toggleBulletComments(bulletId: string): void {
  const ids = bulletCommentIds(bulletId)
  const expanded = ids.some((id) => expandedCommentIds.value.includes(id))
  for (const id of ids) {
    if (expanded) expandedCommentIds.value = expandedCommentIds.value.filter((entry) => entry !== id)
    else expandedCommentIds.value = [...expandedCommentIds.value, id]
  }
}

/** 定位指令对应纸面上的哪个元素。 */
function anchorIdOf(target: EditorFocusTarget): string {
  if (target.type === 'bullet') return `anchor-bullet-${target.id}`
  if (target.type === 'item') return `anchor-item-${target.id}`
  if (target.type === 'section') return `anchor-section-${target.id}`
  if (target.type === 'field') return `anchor-item-${target.itemId}`
  const issue = props.issues.find((entry) => entry.id === target.id)
  if (!issue) return `paper-comment-${target.id}`
  if (issue.bulletId) return `paper-comment-${issue.id}`
  if (issue.itemId) return `anchor-item-${issue.itemId}`
  return `anchor-section-${issue.sectionId}`
}

/** 把光标放进某个条目里的某个字段。 */
function focusFieldIn(target: Extract<EditorFocusTarget, { type: 'field' }>): void {
  const item = document.getElementById(`anchor-item-${target.itemId}`)
  if (!item) return
  const pick = (selector: string, index = 0): void => {
    const element = item.querySelectorAll(selector)[index] as HTMLElement | undefined
    element?.focus()
  }
  if (target.field === 'org') pick('.paper-org input')
  else if (target.field === 'title') pick('.paper-title input')
  else pick('.paper-date-field input', target.field === 'start' ? 0 : 1)
}

/** 外部让编辑器定位到某个地方：滚到那里，批注还要展开。 */
watch(
  () => props.focusTarget,
  async (target) => {
    if (!target) return
    if (target.type === 'comment' && !expandedCommentIds.value.includes(target.id)) {
      expandedCommentIds.value = [...expandedCommentIds.value, target.id]
    }
    await nextTick()
    const anchorId = anchorIdOf(target)
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (target.type === 'field') focusFieldIn(target)
  },
  { immediate: true },
)
</script>

<template>
  <div class="resume-editor" :class="{ 'is-editable': editable }" @keydown="onKeydown">
    <ResumePreview
      :sections="localDraft.sections"
      :profile="localDraft.profile"
      :highlights="editable ? highlights : []"
      :editable="editable"
      @item-focusout="(section, item) => onItemBlur(section.id, item.id)"
    >
      <template #profile-name="{ profile }">
        <PaperField
          :editable="editable"
          :value="profile.name"
          variant="name"
          placeholder="姓名"
          @update="(value: string) => updateProfile({ name: value })"
        />
      </template>

      <template #profile-headline="{ profile }">
        <PaperField
          :editable="editable"
          :value="profile.headline"
          variant="headline"
          placeholder="一句话定位，例如「前端工程师 · 6 年经验」"
          @update="(value: string) => updateProfile({ headline: value })"
        />
      </template>

      <template #profile-contacts="{ profile }">
        <ContactList
          :contacts="profile.contacts"
          :editable="editable"
          :confirming-index="confirmingContactIndex"
          @update="onContactUpdate"
          @request-delete="requestContactDelete"
          @confirm-delete="confirmDeleteContact"
          @cancel-delete="cancelDelete"
        />
      </template>

      <template #profile-add>
        <button type="button" class="paper-add paper-add--after-header" @click="addContact">
          ＋ 新增联系方式
        </button>
      </template>

      <template #item-org="{ section, item }">
        <PaperField
          :editable="editable"
          :value="item.org ?? ''"
          variant="org"
          :placeholder="fieldLabel(section.kind, 'org')"
          @update="(value: string) => updateItemMeta(section.id, item.id, { org: value })"
        />
      </template>

      <template #item-title="{ section, item }">
        <PaperField
          :editable="editable"
          :value="item.title ?? ''"
          variant="title"
          :placeholder="fieldLabel(section.kind, 'title')"
          @update="(value: string) => updateItemMeta(section.id, item.id, { title: value })"
        />
      </template>

      <template #item-dates="{ section, item }">
        <ItemDates
          :start="item.start"
          :end="item.end"
          :present="item.present"
          :editable="editable"
          @update="(patch) => onItemDatesUpdate(section.id, item.id, patch)"
        />
      </template>

      <template #item-delete="{ section, item }">
        <DeleteButton
          v-if="editable && hasItemHead(section.kind)"
          :confirming="confirmingDelete === item.id"
          :delete-title="`删除${itemNoun(section.kind)}`"
          @request="requestDelete(item.id)"
          @confirm="confirmDelete(section.id, item.id)"
          @cancel="cancelDelete"
        />
      </template>

      <template #bullet="{ section, item, bullet }">
        <textarea
          v-if="editable && editingBulletId === bullet.id"
          :id="`bullet-input-${bullet.id}`"
          class="paper-textarea"
          :value="bullet.text"
          rows="1"
          autofocus
          :placeholder="section.kind === 'skills' ? '点此写一条技能' : '点此写一条要点'"
          @input="(event: Event) => editBullet(section.id, item.id, bullet.id, event)"
          @blur="onBulletBlur(section.id, item.id, bullet.id, bullet.text)"
          @keydown="(event: KeyboardEvent) => onBulletKeydown(event, section.id, item.id, bullet.id)"
        ></textarea>
        <span
          v-else
          class="paper-bullet-text"
          :class="{ 'is-editable': editable }"
          :tabindex="editable ? 0 : undefined"
          :role="editable ? 'button' : undefined"
          @click="editable && startEdit(bullet.id)"
          @keydown.enter.prevent="editable && startEdit(bullet.id)"
          >{{ bullet.text }}</span
        >
      </template>

      <template #bullet-delete="{ section, item, bullet }">
        <DeleteButton
          v-if="editable"
          :confirming="confirmingDelete === bullet.id"
          :delete-title="section.kind === 'skills' ? '删除这条技能' : '删除这条要点'"
          @request="requestDelete(bullet.id)"
          @confirm="confirmDelete(section.id, item.id, bullet.id)"
          @cancel="cancelDelete"
        />
      </template>

      <template #item-add="{ section, item }">
        <button
          v-if="editable && hasItemHead(section.kind)"
          type="button"
          class="paper-add paper-add--nested"
          @click="addBulletToItem(section.id, item.id)"
        >
          ＋ 新增一条要点
        </button>
      </template>

      <template #bullet-extra="{ bullet }">
        <BulletComments
          v-if="editable && (bulletIssues.get(bullet.id) ?? []).length > 0"
          :issues="bulletIssues.get(bullet.id) ?? []"
          :expanded="bulletCommentsExpanded(bullet.id)"
          @toggle="toggleBulletComments(bullet.id)"
          @select="revealComment"
        />
      </template>

      <template #section-add="{ section }">
        <button
          v-if="editable"
          type="button"
          class="paper-add"
          @click="addEntry(section.kind, section.id)"
        >
          ＋ {{ addLabel(section.kind) }}
        </button>
      </template>
    </ResumePreview>
  </div>
</template>

<style scoped src="./resume-editor.css"></style>
