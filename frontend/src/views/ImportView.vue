<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UploadFilled } from '@element-plus/icons-vue'

import ResumeEditor from '@/components/ResumeEditor.vue'
import IdentityDialog from '@/components/IdentityDialog.vue'
import { SAMPLE_DRAFT_TEXT, SAMPLE_JDS } from '@/mock/fixtures'
import { useUiStore } from '@/stores/ui'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { LOW_CONFIDENCE_THRESHOLD } from '@/engines/parseDraft'
import { findStructureFindings, type StructureFinding } from '@/engines/structure'
import type { Draft } from '@/domain/types'

const router = useRouter()
const draftStore = useDraftStore()
const uiStore = useUiStore()
const session = useSessionStore()

const tab = ref<'paste' | 'upload'>('paste')
const rawText = ref('')
const parsing = ref(false)
const confidence = ref<number | null>(null)
const warnings = ref<string[]>([])
const failure = ref<string | null>(null)
/** 解析当时查出的结构问题。用户在纸上改的时候它不动，保存时重算。 */
const structureIssues = ref<StructureFinding[]>([])

const lowConfidence = computed(
  () => confidence.value !== null && confidence.value < LOW_CONFIDENCE_THRESHOLD,
)

/** 结构问题出在哪：条目级报条目，分区级报分区。 */
function anchorOf(finding: StructureFinding): string {
  if (finding.itemId) return `${finding.sectionTitle} · ${finding.itemLabel || '未命名条目'}`
  return finding.sectionTitle
}

function parse(): void {
  failure.value = null
  if (!rawText.value.trim()) {
    failure.value = '需要简历正文才能解析'
    ElMessage.warning(failure.value)
    return
  }

  parsing.value = true
  const result = draftStore.ingest(rawText.value)
  parsing.value = false

  if (!result.ok) {
    confidence.value = null
    warnings.value = []
    structureIssues.value = []
    failure.value = result.failure?.message ?? '解析失败'
    ElMessage.error(failure.value)
    return
  }

  confidence.value = result.confidence
  warnings.value = result.warnings
  // 与编辑页同一口径：只列缺字段、时间对不上这类要紧的。
  // 「某个分区是空的」由解析器自己的警告说明。
  structureIssues.value = findStructureFindings(draftStore.pending!).filter(
    (finding) => finding.severity !== 'low',
  )
}

/** 纸上改了内容。 */
function onChange(next: Draft): void {
  draftStore.applyPendingChange(next)
}

/** 身份对话框：未登录时先问名字，确认后这次保存继续。 */
const identityOpen = ref(false)
let pendingSave: (() => void) | null = null

function onIdentified(): void {
  identityOpen.value = false
  const resume = pendingSave
  pendingSave = null
  resume?.()
}

async function save(): Promise<void> {
  if (!draftStore.pending) {
    ElMessage.warning('还没有可保存的解析结果')
    return
  }

  // 身份在有实际意义的时候才问：用户已经看到解析结果，这时留个名字才有动机
  if (!session.isLoggedIn) {
    pendingSave = () => doSave()
    identityOpen.value = true
    return
  }

  await doSave()
}

async function doSave(): Promise<void> {
  if (draftStore.hasDraft) {
    try {
      await ElMessageBox.confirm(
        '再次导入会覆盖当前简历。已经生成的版本不会跟着改变。',
        '确认覆盖当前简历？',
        { type: 'warning', confirmButtonText: '覆盖', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }

  const outcome = draftStore.savePending({ confirmed: true })
  if (!outcome.ok) {
    ElMessage.error(outcome.reason ?? '保存失败')
    return
  }

  // 存成简历时重算一遍结构问题，编辑页的右侧栏里就是最新的那份
  draftStore.checkStructure()
  ElMessage.success('简历已保存')
  router.push('/draft')
}

function loadDemo(): void {
  rawText.value = SAMPLE_DRAFT_TEXT
  parse()
  uiStore.setDemoJd(SAMPLE_JDS[0]?.text ?? null)
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">导入简历</h1>
        <p class="page-subtitle">
          把简历正文粘贴进来，系统会整理成一份可编辑的结构化简历。一个人同时只有一份简历。
        </p>
      </div>
    </div>

    <el-tabs v-model="tab" class="card-block">
      <el-tab-pane label="粘贴文本" name="paste">
        <el-input
          v-model="rawText"
          type="textarea"
          :rows="14"
          placeholder="把简历正文粘贴到这里，包含「教育背景 / 工作经历 / 项目经历 / 专业技能」这样的分区标题会更好解析"
        />
        <div class="inline-row import-actions">
          <el-button type="primary" size="small" :loading="parsing" @click="parse">解析</el-button>
          <el-button text size="small" @click="loadDemo">载入演示数据</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="上传文件" name="upload">
        <el-alert
          type="info"
          show-icon
          :closable="false"
          title="原型阶段暂不支持 PDF 解析"
          description="上传入口只是占位：系统不会读取文件内容，也不会生成任何简历内容。请改用「粘贴文本」页签。"
        />
        <el-upload class="upload-placeholder" drag action="#" :auto-upload="false" :show-file-list="false">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">把文件拖到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">仅作占位展示，请改用粘贴文本</div>
          </template>
        </el-upload>
      </el-tab-pane>
    </el-tabs>

    <el-alert
      v-if="failure"
      class="card-block"
      type="error"
      show-icon
      :closable="false"
      :title="failure"
    />

    <el-alert
      v-if="lowConfidence"
      class="card-block"
      type="warning"
      show-icon
      :closable="false"
      title="结构识别不完整，请确认后再保存"
      description="这次解析没能认出全部分区标题，下面是按启发式推断的。可以在保存前直接在纸上改。"
    />

    <el-alert
      v-for="warning in warnings"
      :key="warning"
      class="card-block"
      type="info"
      show-icon
      :closable="false"
      :title="warning"
    />

    <el-alert
      v-if="structureIssues.length > 0"
      class="card-block"
      type="warning"
      show-icon
      :closable="false"
      :title="`这份简历有 ${structureIssues.length} 处结构问题`"
    >
      <ul class="issue-list">
        <li v-for="issue in structureIssues" :key="`${issue.ruleId}@${issue.itemId || issue.sectionId}`">
          {{ issue.label }} · {{ anchorOf(issue) }}
        </li>
      </ul>
    </el-alert>

    <template v-if="draftStore.pending">
      <div class="page-header page-header--paper result-header">
        <div class="inline-row">
          <h2 class="result-title">解析结果</h2>
          <el-tag v-if="confidence !== null" type="info" effect="plain">
            置信度 {{ Math.round(confidence * 100) }}%
          </el-tag>
        </div>
        <div class="page-actions">
          <el-button type="primary" size="small" @click="save">保存</el-button>
        </div>
      </div>

      <div class="paper-canvas">
        <ResumeEditor
          :draft="draftStore.pending"
          :editable="true"
          @change="onChange"
          @save-request="save"
        />
      </div>
    </template>

    <IdentityDialog
      v-model="identityOpen"
      reason="save"
      @confirmed="onIdentified"
    />
  </div>
</template>

<style scoped>
.import-actions {
  margin-top: 12px;
}

.upload-placeholder {
  margin-top: 16px;
}

/* 解析结果的小标题：与纸同宽 */
.result-header {
  align-items: center;
  margin-bottom: var(--space-md);
}

.result-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.issue-list {
  margin: 4px 0 0;
  padding-left: 18px;
}
</style>
