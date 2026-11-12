<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import { analyzeJd, fetchEngineStatus } from '@/api/resume'
import { SAMPLE_JDS } from '@/mock/fixtures'
import type { RequirementCoverage } from '@xiaoyi/shared/domain/types'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { useVersionStore } from '@/stores/versions'
import {
  ALL_STATES,
  FAILURE_STATES,
  STATUS_STATES,
  WARNING_STATES,
  stateHint,
  stateMessage,
  stateTitle,
} from '@xiaoyi/shared/domain/states'

const router = useRouter()
const draftStore = useDraftStore()
const sessionStore = useSessionStore()
const versionStore = useVersionStore()
const uiStore = useUiStore()

const step = ref(0)
const jdText = ref('')
/** JD 输入框。提取不到要求条目时要把焦点交回来。 */
const jdInput = ref<{ focus: () => void } | null>(null)
const roleName = ref('')
const roleSource = ref('')
const coverage = ref<RequirementCoverage[]>([])
const warnings = ref<string[]>([])
const generating = ref(false)
/** 正在比对。等模型时要让用户知道还在跑。 */
const analyzing = ref(false)
/** 已经等了多久。模型调用要 1-2 分钟，用户需要知道还在跑。 */
const waitedSeconds = ref(0)
let waitTimer: ReturnType<typeof setInterval> | null = null

const generatingTitle = computed(() =>
  useLlm.value
    ? stateTitle(STATUS_STATES['generating-with-model']!)
    : stateTitle(STATUS_STATES['generating-with-rules']!),
)

const generatingHint = computed(() =>
  useLlm.value
    ? stateHint(STATUS_STATES['generating-with-model']!, { value: waitedSeconds.value })
    : stateHint(STATUS_STATES['generating-with-rules']!),
)

const analyzingTitle = computed(() =>
  useLlm.value
    ? stateTitle(STATUS_STATES['analyzing-with-model']!)
    : stateTitle(STATUS_STATES['analyzing-with-rules']!),
)

const analyzingHint = computed(() =>
  useLlm.value
    ? stateHint(STATUS_STATES['analyzing-with-model']!, { value: waitedSeconds.value })
    : stateHint(STATUS_STATES['analyzing-with-rules']!),
)

/**
 * 回落时的提示。
 *
 * **模型没调通就说清是粗判**——不能让用户以为那是逐条比对出来的。
 */
const degradedNotice = computed(() => {
  if (!degraded.value) return null
  const reason = degradeReason.value
  return {
    title: stateTitle(WARNING_STATES['jd-keyword-match']!),
    description: reason
      ? stateHint(WARNING_STATES['jd-keyword-match']!, { value: reason })
      : stateHint(WARNING_STATES['jd-keyword-match']!, { value: '这次没有逐条比对' }),
  }
})

/** 开始计时。服务端是同步调用，前端不知道真进度——只能如实说「还在等」。 */
function startWaiting(): void {
  waitedSeconds.value = 0
  stopWaiting()
  waitTimer = setInterval(() => {
    waitedSeconds.value += 1
  }, 1000)
}

function stopWaiting(): void {
  if (waitTimer === null) return
  clearInterval(waitTimer)
  waitTimer = null
}

onBeforeUnmount(stopWaiting)
const allowVerbFronting = ref(true)
const dropIrrelevantProjects = ref(true)
/** 服务端有没有配模型供应商。没配就不显示那个开关。 */
const llmAvailable = ref(false)
/**
 * 本次要不要用模型。
 *
 * **同时管两件事**：第二步的比对与第三步的改写。
 *
 * 默认值 = 服务端配了供应商 **且** 账号同意过（`docs/privacy-conclusions.md` §7）。
 * 没同意过的账号默认关——打开它时界面会先问一句。
 */
const useLlm = ref(false)
/** 这次比对有没有完全用上模型。 */
const degraded = ref(false)
/** 没完全用上的原因。 */
const degradeReason = ref<string | null>(null)

onMounted(async () => {
  try {
    llmAvailable.value = (await fetchEngineStatus()).available
  } catch {
    // 问不到就当没有：开关不显示，不影响其余功能
    llmAvailable.value = false
  }

  // 默认开：服务端配了供应商，且账号同意过。
  // 同意状态是登录时问来的（`session.restore()`），这里直接用。
  useLlm.value = llmAvailable.value && sessionStore.modelConsentAt !== null
})

const draft = computed(() => draftStore.draft)

const tierLabel: Record<string, string> = {
  strong: '强覆盖',
  weak: '弱覆盖',
  none: '未覆盖',
}

const tierType: Record<string, 'success' | 'warning' | 'info'> = {
  strong: 'success',
  weak: 'warning',
  none: 'info',
}

/**
 * 命中的要点原文。
 *
 * **只显示简历里真实存在的那几条**——命中的依据要能被用户核对。
 */
function matchedTextsOf(row: RequirementCoverage): string[] {
  const current = draftStore.draft
  if (!current) return []
  const texts: string[] = []
  for (const section of current.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        if (row.matchedBulletIds.includes(bullet.id)) texts.push(bullet.text)
      }
    }
  }
  return texts
}

/**
 * 打开「本次用模型」时问一句。
 *
 * **没同意过的账号，用户打开它就是他的点头**——服务端把同意记下来。
 */
async function onToggleModel(next: string | number | boolean): Promise<void> {
  if (next !== true) {
    useLlm.value = false
    return
  }

  if (sessionStore.modelConsentAt === null) {
    try {
      await ElMessageBox.confirm(
        '打开后，这份 JD 与你简历里的分区、条目和要点正文会发给境内模型供应商，用来逐条比对要求。姓名、抬头与联系方式不会发出去。',
        '要把简历内容发给模型供应商？',
        { type: 'warning', confirmButtonText: '同意并继续', cancelButtonText: '取消' },
      )
    } catch {
      useLlm.value = false
      return
    }
    try {
      await sessionStore.grantModelConsent()
    } catch {
      useLlm.value = false
      ElMessage.error(stateMessage(FAILURE_STATES['network-failed']!))
      return
    }
  }

  useLlm.value = true
}

async function parseJd(): Promise<void> {
  if (!jdText.value.trim()) {
    ElMessage.warning(stateMessage(FAILURE_STATES['jd-empty']))
    return
  }

  analyzing.value = true
  startWaiting()
  try {
    // 分析跑在**已保存的简历**上——先把没保存的改动存上去
    if (await draftStore.saveIfDirty()) {
      ElMessage.info('简历有未保存的修改，已先保存再比对')
    }

    const result = await analyzeJd(jdText.value, { useLlm: useLlm.value })
    roleName.value = result.roleName
    roleSource.value = result.roleNameSource
    coverage.value = result.coverage
    warnings.value = result.warnings
    degraded.value = result.degraded
    degradeReason.value = result.degradeReason

    step.value = 1
  } catch (error) {
    coverage.value = []
    ElMessage.error(
      error instanceof Error ? error.message : stateMessage(FAILURE_STATES['jd-parse-failed']),
    )
  } finally {
    analyzing.value = false
    stopWaiting()
  }
}

async function generate(): Promise<void> {
  if (!draft.value) {
    ElMessage.warning(stateMessage(FAILURE_STATES['generate-no-draft']))
    return
  }

  generating.value = true
  startWaiting()
  try {
    if (await draftStore.saveIfDirty()) {
      ElMessage.info('简历有未保存的修改，已先保存再生成版本')
    }
    const version = await versionStore.generate(jdText.value, {
      versionName: roleName.value.trim() || undefined,
      allowVerbFronting: allowVerbFronting.value,
      dropIrrelevantProjects: dropIrrelevantProjects.value,
      useLlm: useLlm.value,
    })
    generating.value = false
    stopWaiting()
    // 模型没调通时要当场说清——版本详情页虽然也写着，但用户未必会去看
    if (version.integrity?.degraded) {
      ElMessage.warning(
        stateMessage(ALL_STATES['model-degraded']!, {
          value: version.integrity.degradeReason ?? '模型没有返回可用的结果',
        }),
      )
    } else {
      ElMessage.success('版本已生成')
    }
    router.push(`/versions/${version.id}`)
  } catch (error) {
    generating.value = false
    stopWaiting()
    ElMessage.error(error instanceof Error ? error.message : stateMessage(FAILURE_STATES['generate-failed']))
  }
}

/** 把焦点交回 JD 输入框，用户改完再解析一次。 */
function focusJdInput(): void {
  jdInput.value?.focus()
}

async function loadSample(text: string): Promise<void> {
  jdText.value = text
  await parseJd()
}

watch(
  () => uiStore.demoJdText,
  async (text) => {
    if (!text) return
    uiStore.setDemoJd(null)
    await loadSample(text)
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">粘贴 JD，生成一版定向简历</h1>
        <p class="page-subtitle">
          版本只对你简历里已经存在的事实做重组、删减和措辞规范化。你简历中没有的公司、项目、职责和数字不会被补写。
        </p>
      </div>
    </div>

    <el-steps :active="step" align-center class="card-block">
      <el-step title="粘贴 JD" />
      <el-step title="确认要求命中情况" />
      <el-step title="生成版本" />
    </el-steps>

    <el-card class="card-block">
      <template #header>JD 全文</template>
      <el-input
        ref="jdInput"
        v-model="jdText"
        type="textarea"
        :rows="12"
        placeholder="把职位描述全文粘贴到这里"
      />
      <el-switch
        v-if="llmAvailable"
        :model-value="useLlm"
        class="model-switch"
        active-text="本次用模型——比对 JD 与简历、改写正文，相关内容会发给模型供应商"
        inactive-text="本次用规则引擎——简历不发给任何第三方"
        @update:model-value="onToggleModel"
      />
      <div class="inline-row import-actions">
        <el-button text size="small" :loading="analyzing" @click="parseJd">解析 JD</el-button>
        <el-button
          v-for="sample in SAMPLE_JDS"
          :key="sample.name"
          text
          size="small"
          @click="loadSample(sample.text)"
        >
          载入示例：{{ sample.name }}
        </el-button>
      </div>
    </el-card>

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
      v-if="analyzing"
      class="card-block"
      type="info"
      show-icon
      :closable="false"
      :title="analyzingTitle"
      :description="analyzingHint"
    />

    <el-card v-if="step >= 1" class="card-block">
      <template #header>
        <div class="inline-row">
          <span>版本名称</span>
          <el-tag v-if="roleSource === 'fallback'" type="warning" effect="plain">
            没有识别到岗位名，这个默认名可以改
          </el-tag>
        </div>
      </template>
      <el-input v-model="roleName" placeholder="版本名称" />
    </el-card>

    <el-card class="card-block">
      <template #header>生成选项</template>
      <div class="stack">
        <el-switch
          v-model="allowVerbFronting"
          active-text="允许把「负责X的开发」改写成「开发X」"
          inactive-text="保持「负责X的开发」原样"
        />
        <el-switch
          v-model="dropIrrelevantProjects"
          active-text="略过与该 JD 完全无关的项目条目"
          inactive-text="保留所有项目条目"
        />
        <p class="text-muted">
          这几个开关只影响措辞、条目的取舍与谁来改写，不会让版本出现你简历里没有的事实。
          模型改写的每一条都会再核一遍，没通过的会换回规则引擎写的那句。
        </p>
      </div>
    </el-card>

    <el-alert
      v-if="degradedNotice"
      class="card-block"
      type="warning"
      show-icon
      :closable="false"
      :title="degradedNotice.title"
      :description="degradedNotice.description"
    />

    <el-card v-if="step >= 1 && coverage.length > 0" class="card-block">
      <template #header>抽取到的要求与命中情况</template>
      <el-table :data="coverage" size="small">
        <el-table-column label="JD 原句" min-width="280">
          <template #default="{ row }">
            <span>{{ row.text }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关键词" width="150">
          <template #default="{ row }">
            <span class="text-muted">{{ row.keywords.join('、') || '无关键词' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="命中依据" min-width="240">
          <template #default="{ row }">
            <span v-if="matchedTextsOf(row as RequirementCoverage).length > 0" class="text-muted">
              {{ matchedTextsOf(row as RequirementCoverage).join('；') }}
            </span>
            <span v-else class="text-muted">简历里没有对应的事实</span>
          </template>
        </el-table-column>
        <el-table-column label="覆盖" width="150">
          <template #default="{ row }">
            <div class="inline-row">
              <el-tag :type="tierType[row.tier]" effect="plain">{{ tierLabel[row.tier] }}</el-tag>
              <el-tag v-if="row.approximate" type="info" effect="plain">按关键词近似匹配</el-tag>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <EmptyState v-if="step >= 1 && coverage.length === 0" state="jd-no-requirements" @action="focusJdInput" />

    <el-alert
      v-if="generating"
      class="card-block"
      type="info"
      show-icon
      :closable="false"
      :title="generatingTitle"
      :description="generatingHint"
    />

    <div class="inline-row">
      <el-button type="primary" size="small" :loading="generating" :disabled="step < 1" @click="generate">
        生成版本
      </el-button>
      <el-button text size="small" @click="router.push('/versions')">查看已有版本</el-button>
    </div>
  </div>
</template>

<style scoped>
.import-actions {
  margin-top: var(--space-md);
}

.model-switch {
  margin-top: var(--space-md);
}
</style>
