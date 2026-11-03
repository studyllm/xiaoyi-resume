<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'

import CommentSidebar from '@/components/CommentSidebar.vue'
import ResumePreview, { type PreviewHighlight } from '@/components/ResumePreview.vue'
import type { DiagnosisIssue } from '@/domain/types'
import { anchorText } from '@/engines/anchor'
import { useDraftStore } from '@/stores/draft'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const draftStore = useDraftStore()
const uiStore = useUiStore()

const draft = computed(() => draftStore.draft)

/** 诊断到了哪一步：还没诊断过、诊断过但没有意见、有意见。 */
const diagnosisState = computed(() => draftStore.diagnosisState)
const hasDiagnosis = computed(() => diagnosisState.value !== 'none')

/** 批注按简历中出现的先后顺序排列，而不是按严重度。 */
const orderedIssues = computed(() => draftStore.orderedIssues)

const highlights = computed<PreviewHighlight[]>(() =>
  orderedIssues.value.map((issue) => ({
    sectionId: issue.sectionId,
    itemId: issue.itemId || undefined,
    bulletId: issue.bulletId || undefined,
    fragment: issue.bulletId ? anchorText(issue) : undefined,
    severity: issue.severity,
  })),
)

function isIgnored(issue: DiagnosisIssue): boolean {
  return uiStore.isIssueIgnored(issue.id)
}

async function scrollToAnchor(issue: DiagnosisIssue): Promise<void> {
  await nextTick()
  const target = issue.bulletId
    ? document.getElementById(`anchor-bullet-${issue.bulletId}`)
    : issue.itemId
      ? document.getElementById(`anchor-item-${issue.itemId}`)
      : document.getElementById(`anchor-section-${issue.sectionId}`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function onSelect(issue: DiagnosisIssue): Promise<void> {
  uiStore.selectComment(issue.id)
  await scrollToAnchor(issue)
}

/** 点简历里的文字，反向高亮对应的批注。 */
function onSelectText(): void {
  const selection = window.getSelection()?.toString().trim()
  if (!selection) return
  const match = orderedIssues.value.find((issue) => anchorText(issue) === selection)
  if (!match) return
  uiStore.selectComment(match.id)
  void nextTick(() => {
    document
      .getElementById(`comment-${match.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function edit(issue: DiagnosisIssue): void {
  uiStore.requestEditMode(issue.id)
  uiStore.focusComment(issue.id)
  router.push('/draft')
}

function toggleHandled(issue: DiagnosisIssue): void {
  if (uiStore.isHandled(issue.id)) uiStore.unmarkHandled(issue.id)
  else uiStore.markHandled(issue.id)
}

function ignore(issue: DiagnosisIssue): void {
  uiStore.ignoreIssue(issue.id)
}

function runDiagnosis(): void {
  draftStore.diagnose()
}

/** 清空诊断结果，连同用户对每条意见的标记一起清掉。 */
function clearDiagnosis(): void {
  draftStore.clearDiagnosis()
  uiStore.clearIssueMarks()
  ElMessage.success('已清空诊断结果')
}

watch(
  () => uiStore.activeCommentId,
  (id) => {
    if (!id) return
    const issue = orderedIssues.value.find((entry) => entry.id === id)
    if (issue) void scrollToAnchor(issue)
  },
)
</script>

<template>
  <div class="diagnosis-layout">
    <div class="diagnosis-main">
      <div class="page-header page-header--paper diagnosis-header">
        <div class="page-header-text">
          <h1 class="page-title">简历诊断</h1>
          <p class="page-subtitle">
            诊断只看简历本身，不读取任何 JD。每条意见作为批注挂在它所批评的位置旁边，改的时候建议就在眼前。
          </p>
        </div>
        <div class="page-actions">
          <el-button type="primary" size="small" @click="runDiagnosis">
            {{ diagnosisState === 'none' ? '开始诊断' : '重新诊断' }}
          </el-button>
          <el-button v-if="hasDiagnosis" text size="small" @click="clearDiagnosis">
            清空诊断结果
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="draftStore.diagnosisStale"
        class="card-block"
        type="warning"
        show-icon
        :closable="false"
        title="简历已经更新，下面是旧修订号上的意见"
        description="重新诊断一次，得到的是当前简历的意见。标了「已改」的批注说明你已经动过那句话。"
      >
        <el-button text size="small" @click="runDiagnosis">重新诊断</el-button>
      </el-alert>

      <el-empty v-if="!draft" description="还没有简历">
        <el-button type="primary" @click="router.push('/import')">去导入简历</el-button>
      </el-empty>

      <div v-else class="resume-canvas" @mouseup="onSelectText">
        <ResumePreview
          :sections="draft.sections"
          :profile="draft.profile"
          :highlights="highlights"
        />
      </div>
    </div>

    <CommentSidebar
      :issues="orderedIssues"
      :diagnosis-state="diagnosisState"
      :is-handled="uiStore.isHandled"
      :is-changed="(bulletId: string) => draftStore.isBulletChanged(bulletId)"
      :is-ignored="isIgnored"
      @select="onSelect"
      @edit="edit"
      @toggle-handled="toggleHandled"
      @ignore="ignore"
      @start-diagnosis="runDiagnosis"
    />
  </div>
</template>

<style scoped>
.diagnosis-layout {
  display: flex;
  align-items: stretch;
  min-height: 100%;
}

.diagnosis-main {
  flex: 1;
  min-width: 0;
}

/* 标题、说明左对齐；按钮和「简历诊断」同一行，靠右 */
.diagnosis-header {
  flex-wrap: nowrap;
  align-items: flex-start;
}

.diagnosis-header .page-header-text {
  flex: 1 1 auto;
}

.diagnosis-header .page-title,
.diagnosis-header .page-subtitle {
  text-align: left;
}

.diagnosis-header .page-actions {
  flex: 0 0 auto;
  justify-content: flex-end;
  margin-left: auto;
}

.diagnosis-main .resume-preview.resume-preview {
  justify-content: center;
  padding: 0;
}

.diagnosis-main .resume-paper {
  max-width: 100%;
}

.diagnosis-main > .card-block,
.diagnosis-main > .el-empty {
  max-width: var(--paper-width);
  margin-left: auto;
  margin-right: auto;
}

.resume-canvas {
  background: var(--desk);
  border-radius: var(--radius-md);
  overflow: hidden;
}
</style>
