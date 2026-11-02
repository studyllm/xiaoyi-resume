<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'

import PaperField from '@/components/PaperField.vue'
import ResumePreview, { type PreviewHighlight } from '@/components/ResumePreview.vue'
import { collectDraftIds, resumeIdSeed } from '@/domain/ids'
import { SECTION_FIELD_WORDS } from '@/domain/sectionFields'
import { anchorText } from '@/engines/anchor'
import { addSkillRow, applyOp, isEmptyItem } from '@/engines/editing'
import type { DiagnosisIssue, Draft, DraftProfile, SectionKind } from '@/domain/types'

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

function dateRange(item: { start?: string | null; end?: string | null; present?: boolean }): string {
  if (!item.start) return ''
  if (item.present) return `${item.start} - 至今`
  if (item.end) return `${item.start} - ${item.end}`
  return item.start
}

const SECTION_ADD_LABELS: Record<SectionKind, string> = {
  education: '新增一段教育经历',
  experience: '新增一段工作经历',
  project: '新增一个项目',
  skills: '新增一条技能',
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
  if (section === 'skills') {
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

function updateItemMeta(
  sectionId: string,
  itemId: string,
  patch: { org?: string; title?: string; start?: string | null; end?: string | null; present?: boolean },
): void {
  commit(applyOp(localDraft.value, { type: 'set-item-meta', sectionId, itemId, patch }))
}

function updatePresent(sectionId: string, itemId: string, value: unknown): void {
  updateItemMeta(sectionId, itemId, { present: Boolean(value) })
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

/** 收起时给的那行摘要：说的是问题本身，不是被批的那句话。 */
function bulletStripSummary(bulletId: string): string {
  const issues = bulletIssues.value.get(bulletId) ?? []
  if (issues.length === 0) return ''
  return issues[0]!.problem
}

function severityOf(issues: DiagnosisIssue[]): 'high' | 'medium' | 'low' {
  if (issues.some((issue) => issue.severity === 'high')) return 'high'
  if (issues.some((issue) => issue.severity === 'medium')) return 'medium'
  return 'low'
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
        <span v-if="!editable" class="paper-contacts-text">
          {{ profile.contacts.map((contact) => contact.value).join(' · ') }}
        </span>
        <template v-else>
          <span v-for="(contact, index) in profile.contacts" :key="index" class="paper-contact">
            <el-input
              :model-value="contact.label"
              borderless
              class="paper-input paper-input--label"
              placeholder="标签"
              @update:model-value="(value: string) => setContact(index, { label: value })"
            />
            <el-input
              :model-value="contact.value"
              borderless
              class="paper-input"
              placeholder="内容"
              @update:model-value="(value: string) => setContact(index, { value })"
            />
            <el-button
              v-if="confirmingDelete !== contactKey(index)"
              size="small"
              text
              :icon="Delete"
              class="paper-delete"
              title="删除这个联系方式"
              aria-label="删除这个联系方式"
              @click="requestDelete(contactKey(index))"
            />
            <template v-else>
              <el-button size="small" text type="danger" @click="confirmDeleteContact(index)">
                确认删除？
              </el-button>
              <el-button size="small" text @click="cancelDelete">取消</el-button>
            </template>
          </span>
        </template>
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
        <span v-if="!editable" class="paper-dates-text">{{ dateRange(item) }}</span>
        <template v-else>
          <!-- 日期选择器的根是 Fragment，拿不到 scoped 属性，用一层带 scope 的元素承接样式 -->
          <span class="paper-date-field">
            <el-date-picker
              :model-value="item.start ?? undefined"
              type="month"
              value-format="YYYY-MM"
              placeholder="开始年月"
              @update:model-value="
                (value: string | null) => updateItemMeta(section.id, item.id, { start: value })
              "
            />
          </span>
          <span class="paper-date-sep">–</span>
          <span class="paper-date-field">
            <el-date-picker
              :model-value="item.end ?? undefined"
              type="month"
              value-format="YYYY-MM"
              placeholder="结束年月"
              :disabled="item.present"
              @update:model-value="
                (value: string | null) => updateItemMeta(section.id, item.id, { end: value })
              "
            />
          </span>
          <el-checkbox
            :model-value="item.present ?? false"
            class="paper-present"
            @update:model-value="
              (value: string | number | boolean) => updatePresent(section.id, item.id, value)
            "
          >
            至今
          </el-checkbox>
        </template>
      </template>

      <template #item-delete="{ section, item }">
        <span v-if="editable && section.kind !== 'skills'" class="paper-action">
          <el-button
            v-if="confirmingDelete !== item.id"
            size="small"
            text
            :icon="Delete"
            class="paper-delete"
            :title="`删除${itemNoun(section.kind)}`"
            :aria-label="`删除${itemNoun(section.kind)}`"
            @click="requestDelete(item.id)"
          />
          <template v-else>
            <el-button size="small" text type="danger" @click="confirmDelete(section.id, item.id)">
              确认删除？
            </el-button>
            <el-button size="small" text @click="cancelDelete">取消</el-button>
          </template>
        </span>
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
        <span v-if="editable" class="paper-action">
          <el-button
            v-if="confirmingDelete !== bullet.id"
            size="small"
            text
            :icon="Delete"
            class="paper-delete"
            :title="section.kind === 'skills' ? '删除这条技能' : '删除这条要点'"
            :aria-label="section.kind === 'skills' ? '删除这条技能' : '删除这条要点'"
            @click="requestDelete(bullet.id)"
          />
          <template v-else>
            <el-button size="small" text type="danger" @click="confirmDelete(section.id, item.id, bullet.id)">
              确认删除？
            </el-button>
            <el-button size="small" text @click="cancelDelete">取消</el-button>
          </template>
        </span>
      </template>

      <template #item-add="{ section, item }">
        <button
          v-if="editable && section.kind !== 'skills'"
          type="button"
          class="paper-add paper-add--nested"
          @click="addBulletToItem(section.id, item.id)"
        >
          ＋ 新增一条要点
        </button>
      </template>

      <template #bullet-extra="{ bullet }">
        <div
          v-if="editable && (bulletIssues.get(bullet.id) ?? []).length > 0"
          class="paper-comment"
        >
          <button
            type="button"
            class="comment-strip"
            :class="`comment-strip--${severityOf(bulletIssues.get(bullet.id) ?? [])}`"
            @click="toggleBulletComments(bullet.id)"
          >
            <span class="comment-strip-count">
              {{ bulletIssues.get(bullet.id)!.length }} 条批注
            </span>
            <span class="comment-strip-summary" v-show="!bulletCommentsExpanded(bullet.id)">
              {{ bulletStripSummary(bullet.id) }}
            </span>
            <span class="comment-strip-toggle">
              {{ bulletCommentsExpanded(bullet.id) ? '收起' : '展开' }}
            </span>
          </button>

          <ul v-if="bulletCommentsExpanded(bullet.id)" class="comment-inline">
            <li
              v-for="issue in bulletIssues.get(bullet.id) ?? []"
              :id="`paper-comment-${issue.id}`"
              :key="issue.id"
              class="comment-inline-row"
              :class="`comment-inline-row--${issue.severity}`"
              @click="revealComment(issue)"
            >
              <span class="comment-inline-text">{{ issue.problem }}</span>
              <span class="comment-inline-suggestion">{{ issue.suggestion }}</span>
            </li>
          </ul>
        </div>
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
