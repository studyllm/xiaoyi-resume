<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UploadFilled } from '@element-plus/icons-vue'

import ResumeEditor from '@/components/ResumeEditor.vue'
import IdentityDialog from '@/components/IdentityDialog.vue'
import { SAMPLE_DRAFT_TEXT, SAMPLE_JDS } from '@/mock/fixtures'
import { useUiStore } from '@/stores/ui'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { LOW_CONFIDENCE_THRESHOLD } from '@/engines/parseDraft'
import { extractPdfText } from '@/engines/pdfText'
import { findStructureFindings, type StructureFinding } from '@/engines/structure'
import type { Draft } from '@/domain/types'

const router = useRouter()
const draftStore = useDraftStore()
const uiStore = useUiStore()
const session = useSessionStore()

const tab = ref<'paste' | 'upload'>('paste')
const rawText = ref('')
const parsing = ref(false)
const extracting = ref(false)
const confidence = ref<number | null>(null)
const warnings = ref<string[]>([])
const failure = ref<string | null>(null)
/** 疑似分区表头但没被认出来的行——它们的内容被并进了上一个分区。 */
const otherHeaders = ref<string[]>([])
/** 解析当时查出的结构问题。用户在纸上改的时候它不动，保存时重算。 */
const structureIssues = ref<StructureFinding[]>([])
/** 粘贴输入框。PDF 没有文字层时要把焦点交回去。 */
const pasteInput = ref<{ focus: () => void } | null>(null)

const lowConfidence = computed(
  () => confidence.value !== null && confidence.value < LOW_CONFIDENCE_THRESHOLD,
)

/** 结构问题出在哪：条目级报条目，分区级报分区。 */
function anchorOf(finding: StructureFinding): string {
  if (finding.itemId) return `${finding.sectionTitle} · ${finding.itemLabel || '未命名条目'}`
  return finding.sectionTitle
}

/** 返回解析是否成功——上传路径要靠它决定要不要把用户带回粘贴页签。 */
function parse(extraWarnings: string[] = []): boolean {
  failure.value = null
  if (!rawText.value.trim()) {
    failure.value = '需要简历正文才能解析'
    ElMessage.warning(failure.value)
    return false
  }

  parsing.value = true
  const result = draftStore.ingest(rawText.value)
  parsing.value = false

  if (!result.ok) {
    confidence.value = null
    // 额外的警告要留着——上传来的文字可能很少，用户更需要知道这一点
    warnings.value = [...extraWarnings]
    structureIssues.value = []
    otherHeaders.value = []
    failure.value = result.failure?.message ?? '解析失败'
    ElMessage.error(failure.value)
    return false
  }

  confidence.value = result.confidence
  warnings.value = [...extraWarnings, ...result.warnings]
  otherHeaders.value = result.otherHeaders
  // 与编辑页同一口径：只列缺字段、时间对不上这类要紧的。
  // 「某个分区是空的」由解析器自己的警告说明。
  structureIssues.value = findStructureFindings(draftStore.pending!).filter(
    (finding) => finding.severity !== 'low',
  )
  return true
}

/**
 * 上传 PDF。提取出的文字走与粘贴同一个入口，不新写一条解析路径。
 */
async function onFileSelected(uploadFile: { raw?: File }): Promise<void> {
  const raw = uploadFile.raw
  if (!raw || extracting.value) return

  extracting.value = true
  failure.value = null
  try {
    const result = await extractPdfText(raw)

    if (!result.ok) {
      failure.value = result.failure?.message ?? '这份 PDF 读不出来'
      ElMessage.error(failure.value)
      return
    }

    if (result.quality === 'none') {
      failure.value =
        '这份 PDF 没有可读取的文字层，可能是扫描件或图片页。请改用「粘贴文本」，把内容贴进来。'
      tab.value = 'paste'
      await nextTick()
      pasteInput.value?.focus()
      ElMessage.warning(failure.value)
      return
    }

    // 提取出的文字先进输入框：用户能看到读到了什么，也能自己补
    rawText.value = result.text
    const parsed = parse(result.warnings)
    if (!parsed && result.quality === 'sparse') {
      // 结构认不出来，但读到的文字已经交到用户手上了——带回粘贴页签让他改
      tab.value = 'paste'
      await nextTick()
      pasteInput.value?.focus()
    }
  } finally {
    extracting.value = false
  }
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
          ref="pasteInput"
          v-model="rawText"
          type="textarea"
          :rows="14"
          placeholder="把简历正文粘贴到这里，包含「教育背景 / 工作经历 / 项目经历 / 专业技能」这样的分区标题会更好解析"
        />
        <div class="inline-row import-actions">
          <el-button type="primary" size="small" :loading="parsing" @click="parse()">解析</el-button>
          <el-button text size="small" @click="loadDemo">载入演示数据</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="上传文件" name="upload">
        <el-alert
          v-if="extracting"
          class="card-block"
          type="info"
          show-icon
          :closable="false"
          title="正在读取 PDF 的文字"
          description="文件在浏览器里解析，不会上传到任何服务器。"
        />
        <el-upload
          class="upload-drop"
          drag
          accept="application/pdf,.pdf"
          :auto-upload="false"
          :show-file-list="false"
          :disabled="extracting"
          :on-change="onFileSelected"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">把 PDF 拖到此处，或<em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">
              只支持 PDF，文件在浏览器里解析。读不出文字时会把你能读到的部分交给你改。
            </div>
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
      v-if="otherHeaders.length > 0"
      class="card-block"
      type="warning"
      show-icon
      :closable="false"
      :title="`这份简历有 ${otherHeaders.length} 段我们不确定属于哪个分区，放在「其它」里了`"
      description="下面这几段没能归到教育、经历、项目、技能任何一个分区。可以在纸上直接改。"
    >
      <ul class="issue-list">
        <li v-for="line in otherHeaders" :key="line">{{ line }}</li>
      </ul>
    </el-alert>

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
  margin-top: var(--space-md);
}

.upload-drop {
  margin-top: var(--space-lg);
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
  margin: var(--space-xs) 0 0;
  padding-left: var(--space-lg);
}
</style>
