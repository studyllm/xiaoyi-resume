<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import CommentSidebar from '@/components/CommentSidebar.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaperCanvas from '@/components/PaperCanvas.vue'
import ResumeEditor, { type EditorFocusTarget } from '@/components/ResumeEditor.vue'
import { EMPTY_STATES, stateTitle } from '@/domain/states'
import type { DiagnosisIssue, Draft } from '@/domain/types'
import type { StructureFinding } from '@/engines/structure'
import { useDraftStore } from '@/stores/draft'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const draftStore = useDraftStore()
const uiStore = useUiStore()

const draft = computed(() => draftStore.draft)

/** 批注按简历里的先后顺序排，不按严重度。 */
const allIssues = computed(() => draftStore.orderedIssues)

/** 预览与编辑两种模式。默认预览，只有编辑模式才摊开批注。 */
const mode = ref<'preview' | 'edit'>('preview')
const editable = computed(() => mode.value === 'edit')

const issueCount = computed(() => allIssues.value.length)

/** 诊断到了哪一步：还没诊断过、诊断过但没有意见、有意见。 */
const diagnosisState = computed(() => draftStore.diagnosisState)

/** 纸面区域的状态。变化时向读屏软件播报，视觉上的反馈在别处。 */
const paperStatus = computed(() => {
  if (draftStore.dirty) return '简历有未保存的修改'
  if (diagnosisState.value === 'none') return '还没有诊断结果'
  if (diagnosisState.value === 'empty') return '诊断没有查出问题'
  return `简历已保存，共 ${allIssues.value.length} 条诊断意见`
})

/** 侧栏里的「去诊断」把用户带到诊断页，诊断本身在那儿发起。 */
function goDiagnose(): void {
  router.push('/diagnosis')
}

/** 让编辑器定位到某个地方：某条要点、某个分区、某条批注。 */
const focusTarget = ref<EditorFocusTarget | null>(null)

/** 编辑器给出改过的简历。 */
function onChange(next: Draft): void {
  draftStore.applyChange(next)
}

/** 用户点了纸面上的批注或结构标注：右侧批注栏选中它。 */
function onSelectComment(issue: DiagnosisIssue): void {
  uiStore.selectComment(issue.id)
  uiStore.focusCommentId = issue.id
  focusTarget.value = { type: 'comment', id: issue.id }
}

function toggleHandled(issue: DiagnosisIssue): void {
  if (uiStore.isHandled(issue.id)) uiStore.unmarkHandled(issue.id)
  else uiStore.markHandled(issue.id)
}

/**
 * 保存。保存完检查一遍结构问题：
 * 还有问题就留在编辑模式，清单在右侧栏里，可以逐条跳进去补；都补完了才切预览。
 */
function saveEdits(): void {
  draftStore.saveEdits()
  const findings = draftStore.checkStructure()
  ElMessage.success('已保存')
  mode.value = findings.length > 0 ? 'edit' : 'preview'
}

/** 点结构问题清单里的一条：跳到出问题的那个字段。 */
function locateStructure(finding: StructureFinding): void {
  mode.value = 'edit'
  if (finding.field) {
    focusTarget.value = {
      type: 'field',
      sectionId: finding.sectionId,
      itemId: finding.itemId,
      field: finding.field,
    }
    return
  }
  if (finding.itemId) {
    focusTarget.value = { type: 'item', id: finding.itemId }
    return
  }
  focusTarget.value = { type: 'section', id: finding.sectionId }
}

function discardEdits(): void {
  draftStore.discardEdits()
  ElMessage.info('已放弃这次修改')
}

async function replaceDraft(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '重新导入会覆盖当前简历。已经生成的版本保持原样，不会跟着改变。',
      '确认覆盖当前简历？',
      { type: 'warning', confirmButtonText: '去导入简历', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  router.push('/import')
}

onMounted(() => {
  // 诊断页「去修改」带过来的请求：进入编辑模式并定位到那条批注
  const request = uiStore.consumeEditRequest()
  if (request === null) return
  mode.value = 'edit'
  focusTarget.value = { type: 'comment', id: request }
})

watch(
  () => uiStore.focusCommentId,
  async (commentId) => {
    if (!commentId) return
    // 批注栏里那条卡片也要滚到可见位置
    await new Promise((resolve) => setTimeout(resolve, 0))
    document
      .getElementById(`comment-${commentId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  },
)

/** 左侧分区目录点过来时，纸滚动到对应分区。 */
watch(
  () => uiStore.scrollToSection,
  (sectionId) => {
    if (!sectionId) return
    focusTarget.value = { type: 'section', id: sectionId }
    uiStore.clearScrollToSection()
  },
)
</script>

<template>
  <div class="draft-layout">
    <div class="draft-main">
      <div class="page-header page-header--paper draft-header">
        <div class="page-header-text">
          <div class="inline-row">
            <h1 class="page-title">我的简历</h1>
            <el-tag v-if="draftStore.dirty" type="warning" effect="plain" size="small">未保存</el-tag>
          </div>
          <p class="page-subtitle">简历以这一份为准，改动不会影响已经生成的版本。</p>
        </div>
        <div class="page-actions">
          <span v-if="draft" class="draft-hint">
            <template v-if="diagnosisState === 'none'">
              {{ stateTitle(EMPTY_STATES['no-diagnosis']) }}
            </template>
            <template v-else-if="diagnosisState === 'empty'">
              {{ stateTitle(EMPTY_STATES['no-diagnosis-issues']) }}
            </template>
            <template v-else-if="editable">批注 {{ issueCount }} 条</template>
            <template v-else>{{ issueCount }} 条诊断意见</template>
            <el-link type="primary" @click="goDiagnose">去诊断</el-link>
          </span>
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="preview">预览</el-radio-button>
            <el-radio-button value="edit">编辑</el-radio-button>
          </el-radio-group>
          <template v-if="editable">
            <el-button type="primary" size="small" :disabled="!draftStore.dirty" @click="saveEdits">
              保存
            </el-button>
            <el-button v-if="draftStore.dirty" size="small" text @click="discardEdits">
              放弃修改
            </el-button>
          </template>
          <el-button v-if="!editable" size="small" text @click="replaceDraft">重新导入</el-button>
        </div>
      </div>

      <EmptyState v-if="!draft" state="no-draft" @action="router.push('/import')" />

      <PaperCanvas v-else :status="paperStatus">
        <ResumeEditor
          :draft="draft"
          :issues="allIssues"
          :editable="editable"
          :focus-target="focusTarget"
          @change="onChange"
          @select-comment="onSelectComment"
          @save-request="saveEdits"
        />
      </PaperCanvas>
    </div>

    <CommentSidebar
      v-if="draft && editable"
      :issues="allIssues"
      :diagnosis-state="diagnosisState"
      empty-action-label="去诊断"
      :is-handled="uiStore.isHandled"
      :is-changed="(bulletId: string) => draftStore.isBulletChanged(bulletId)"
      :is-ignored="(issue: DiagnosisIssue) => uiStore.isIssueIgnored(issue.id)"
      :structure-findings="draftStore.structureFindings"
      @select="(issue: DiagnosisIssue) => uiStore.selectComment(issue.id)"
      @edit="(issue: DiagnosisIssue) => onSelectComment(issue)"
      @toggle-handled="toggleHandled"
      @ignore="(issue: DiagnosisIssue) => uiStore.ignoreIssue(issue.id)"
      @locate="locateStructure"
      @start-diagnosis="goDiagnose"
    />
  </div>
</template>

<style scoped>
/* 页头的诊断提示：刻意做轻，计数与文字都是弱化灰，只有链接用主色 */
.draft-hint {
  font-size: var(--text-xs);
  color: var(--ink-500);
}

.draft-hint :deep(.el-link) {
  margin-left: var(--space-xs);
  font-size: var(--text-xs);
  vertical-align: baseline;
}

.draft-layout {
  display: flex;
  align-items: stretch;
  min-height: 100%;
}

.draft-main {
  flex: 1;
  min-width: 0;
}

/* 标题留在纸的左缘；诊断提示、预览、编辑、重新导入和标题同一行，靠右 */
.draft-header {
  flex-wrap: nowrap;
  align-items: flex-start;
}

.draft-header .page-header-text {
  flex: 1 1 auto;
  min-width: 0;
}

.draft-header .page-actions {
  flex: 0 0 auto;
  justify-content: flex-end;
  margin-left: auto;
}

</style>
