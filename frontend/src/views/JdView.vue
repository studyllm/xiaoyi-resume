<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import { fetchEngineStatus } from '@/api/resume'
import { SAMPLE_JDS } from '@/mock/fixtures'
import type { RequirementCoverage } from '@xiaoyi/shared/engines/types'
import { engineContext, useEngines } from '@/stores/engines'
import { useDraftStore } from '@/stores/draft'
import { useUiStore } from '@/stores/ui'
import { useVersionStore } from '@/stores/versions'
import { ALL_STATES, FAILURE_STATES, stateMessage } from '@xiaoyi/shared/domain/states'

const router = useRouter()
const draftStore = useDraftStore()
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
const allowVerbFronting = ref(true)
const dropIrrelevantProjects = ref(true)
/** 服务端有没有配模型供应商。没配就不显示那个开关。 */
const llmAvailable = ref(false)
/** 本次要不要用模型改写。默认不用——要把简历发给第三方得用户自己点头。 */
const useLlm = ref(false)

onMounted(async () => {
  try {
    llmAvailable.value = (await fetchEngineStatus()).available
  } catch {
    // 问不到就当没有：开关不显示，不影响其余功能
    llmAvailable.value = false
  }
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

function parseJd(): void {
  if (!jdText.value.trim()) {
    ElMessage.warning(stateMessage(FAILURE_STATES['jd-empty']))
    return
  }

  const engines = useEngines()
  try {
    const { jd, warnings: jdWarnings } = engines.parseJd(jdText.value, engineContext())
    roleName.value = jd.roleName
    roleSource.value = jd.roleNameSource
    warnings.value = jdWarnings

    coverage.value = draft.value
      ? engines.evaluateJd(draft.value, jd, engineContext())
      : []

    step.value = 1
  } catch (error) {
    coverage.value = []
    ElMessage.error(
      error instanceof Error ? error.message : stateMessage(FAILURE_STATES['jd-parse-failed']),
    )
  }
}

async function generate(): Promise<void> {
  if (!draft.value) {
    ElMessage.warning(stateMessage(FAILURE_STATES['generate-no-draft']))
    return
  }

  generating.value = true
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
    ElMessage.error(error instanceof Error ? error.message : stateMessage(FAILURE_STATES['generate-failed']))
  }
}

/** 把焦点交回 JD 输入框，用户改完再解析一次。 */
function focusJdInput(): void {
  jdInput.value?.focus()
}

function loadSample(text: string): void {
  jdText.value = text
  parseJd()
}

watch(
  () => uiStore.demoJdText,
  (text) => {
    if (!text) return
    uiStore.setDemoJd(null)
    loadSample(text)
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
      <div class="inline-row import-actions">
        <el-button text size="small" @click="parseJd">解析 JD</el-button>
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
        <el-switch
          v-if="llmAvailable"
          v-model="useLlm"
          active-text="本次用模型改写——相关内容会发给模型供应商"
          inactive-text="本次用规则引擎生成——简历不发给任何第三方"
        />
        <p class="text-muted">
          这几个开关只影响措辞、条目的取舍与谁来改写，不会让版本出现你简历里没有的事实。
          模型改写的每一条都会再核一遍，没通过的会换回规则引擎写的那句。
        </p>
      </div>
    </el-card>

    <el-card v-if="step >= 1 && coverage.length > 0" class="card-block">
      <template #header>抽取到的要求与命中情况</template>
      <el-table :data="coverage" size="small">
        <el-table-column label="JD 原句" min-width="320">
          <template #default="{ row }">
            <span>{{ row.text }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关键词" width="180">
          <template #default="{ row }">
            <span class="text-muted">{{ row.keywords.join('、') || '无关键词，按近似匹配' }}</span>
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
</style>
