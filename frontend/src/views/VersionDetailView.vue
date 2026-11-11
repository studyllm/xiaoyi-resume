<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CopyDocument, Download } from '@element-plus/icons-vue'

import EmptyState from '@/components/EmptyState.vue'
import ResumePreview from '@/components/ResumePreview.vue'
import type { DiffEntry, ResumeVersion, SectionKind } from '@xiaoyi/shared/domain/types'
import { renderMarkdown } from '@xiaoyi/shared/engines/markdown'
import { FAILURE_STATES, stateHint, stateMessage, stateTitle } from '@xiaoyi/shared/domain/states'
import { useDraftStore } from '@/stores/draft'
import { useVersionStore } from '@/stores/versions'

const route = useRoute()
const router = useRouter()
const versionStore = useVersionStore()

const tab = ref<'preview' | 'body' | 'coverage' | 'diff' | 'uncovered'>('preview')

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

const version = computed<ResumeVersion | undefined>(() => versionStore.byId(String(route.params.id)))

/** 版本分区没有稳定 id，用 kind 补一个，供纸面锚点使用。 */
const paperSections = computed(() =>
  (version.value?.sections ?? []).map((section) => ({ ...section, id: section.kind })),
)

const coverage = computed(() => version.value?.coverage ?? [])
const profile = computed(() => version.value?.profile ?? { name: '', headline: '', contacts: [] })

interface DiffGroup {
  sectionKind: SectionKind
  sectionTitle: string
  itemId: string
  itemLabel: string
  entries: DiffEntry[]
}

const groups = computed<DiffGroup[]>(() => {
  const map = new Map<string, DiffGroup>()
  for (const entry of version.value?.diff ?? []) {
    const key = `${entry.sectionKind}:${entry.itemId}`
    let group = map.get(key)
    if (!group) {
      group = {
        sectionKind: entry.sectionKind,
        sectionTitle: entry.sectionTitle,
        itemId: entry.itemId,
        itemLabel: entry.itemLabel,
        entries: [],
      }
      map.set(key, group)
    }
    group.entries.push(entry)
  }
  return [...map.values()]
})

const integrityText = computed(() => {
  const integrity = version.value?.integrity
  if (!integrity) return ''
  const checked = integrity.checked

  // 老版本没有这几个字段，按规则引擎生成来看
  const generator = integrity.generator ?? 'rules'
  const reverted = integrity.reverted ?? 0
  const degraded = integrity.degraded ?? false

  if (generator === 'llm') {
    if (reverted > 0) {
      return `本次由模型生成，有 ${reverted} 处没有采用模型的改写，已换回规则引擎的产出（${checked} 条已校验）`
    }
    return `本次由模型生成，未新增原简历之外的任何事实（${checked} 条已校验）`
  }

  if (degraded) {
    // 原因要一起说：只说「没用上」，用户还得自己去翻日志
    const reason = integrity.degradeReason
    return reason
      ? `模型这次没有用上（${reason}），这一版由规则引擎生成（${checked} 条已校验）`
      : `模型这次没有用上，这一版由规则引擎生成（${checked} 条已校验）`
  }

  if (integrity.violations.length === 0) {
    return `本次生成未新增原简历之外的任何事实（${checked} 条已校验，0 处异常）`
  }
  return `本次生成有 ${integrity.violations.length} 处改写没有通过校验，已回退为原文（${checked} 条已校验）`
})

/** 这一版的正文是谁写的。老版本没有这个字段，按规则引擎生成来看。 */
const generatorNotice = computed(() => {
  const generator = version.value?.integrity?.generator ?? 'rules'
  if (generator === 'llm') {
    return '本版本由模型生成，模型写的每一条断言都经过事实校验，没有通过的都换回了规则引擎的产出'
  }
  return '本版本由本地规则引擎生成，不是真实模型输出'
})

const integrityAlertType = computed<'success' | 'warning'>(() => {
  const integrity = version.value?.integrity
  if (!integrity) return 'success'
  const generator = integrity.generator ?? 'rules'
  const reverted = integrity.reverted ?? 0
  if (generator === 'llm') return reverted > 0 ? 'warning' : 'success'
  if (integrity.degraded) return 'warning'
  return integrity.violations.length === 0 ? 'success' : 'warning'
})

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error(stateMessage(FAILURE_STATES['copy-failed']))
  }
}

function onCopyCommand(command: string): void {
  if (command === 'markdown') void copyMarkdown()
  else void copyPlainText()
}

async function copyPlainText(): Promise<void> {
  if (!version.value) return
  await copyText(version.value.body, '纯文本')
}

async function copyMarkdown(): Promise<void> {
  if (!version.value) return
  await copyText(renderMarkdown(version.value), 'Markdown')
}

function hasProfile(): boolean {
  const profile = version.value?.profile
  if (!profile) return false
  return Boolean(profile.name) && profile.contacts.length > 0
}

async function exportPdf(): Promise<void> {
  if (!version.value) return
  if (await useDraftStore().saveIfDirty()) {
    ElMessage.info('简历有未保存的修改，已先保存再导出')
  }

  if (!hasProfile()) {
    try {
      await ElMessageBox.confirm(
        stateHint(FAILURE_STATES['export-missing-profile']),
        stateTitle(FAILURE_STATES['export-missing-profile']),
        { type: 'warning', confirmButtonText: '去补全', cancelButtonText: '仍然导出' },
      )
      router.push('/draft')
      return
    } catch {
      router.push(`/versions/${version.value.id}/print`)
      return
    }
  }

  router.push(`/versions/${version.value.id}/print`)
}
</script>

<template>
  <div class="page">
    <EmptyState v-if="!version" state="version-not-found" @action="router.push('/versions')" />

    <template v-else>
      <div class="page-header">
        <div class="page-header-text">
          <h1 class="page-title">{{ version.name }}</h1>
          <p class="page-subtitle">
            生成于简历修订号 {{ version.draftRevision }}，对应岗位「{{ version.jdRoleName }}」
          </p>
        </div>
        <div class="page-actions">
          <el-dropdown trigger="click" @command="onCopyCommand">
            <el-button text size="small" :icon="CopyDocument">复制</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="text">纯文本</el-dropdown-item>
                <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" size="small" :icon="Download" @click="exportPdf">
            导出 PDF
          </el-button>
          <el-button text size="small" @click="router.push('/versions')">返回列表</el-button>
        </div>
      </div>

      <el-alert
        class="card-block"
        type="info"
        show-icon
        :closable="false"
        :title="generatorNotice"
      />

      <el-card class="card-block">
        <template #header>版本说明</template>
        <p class="description">
          这一版只对你简历中已有的事实做重组、删减与措辞规范化，未新增任何公司、项目、职责或数字；
          共 {{ version.uncovered.length }} 项 JD 要求在你的简历中没有对应事实，已在「未覆盖要求」中列出。
        </p>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="对应岗位">{{ version.jdRoleName }}</el-descriptions-item>
          <el-descriptions-item label="生成时的简历修订号">{{ version.draftRevision }}</el-descriptions-item>
          <el-descriptions-item label="生成时间">{{ version.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="引擎版本">{{ version.engineVersion }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          class="integrity-alert"
          :type="integrityAlertType"
          show-icon
          :closable="false"
          :title="integrityText"
        />
      </el-card>

      <el-tabs v-model="tab">
        <el-tab-pane label="简历预览" name="preview">
          <ResumePreview :sections="paperSections" :profile="profile" />
        </el-tab-pane>

        <el-tab-pane label="正文全文" name="body">
          <pre class="version-body mono">{{ version.body }}</pre>
        </el-tab-pane>

        <el-tab-pane :label="`要求覆盖（${coverage.length}）`" name="coverage">
          <el-table :data="coverage" size="small">
            <el-table-column label="JD 原句" min-width="300">
              <template #default="{ row }">{{ row.text }}</template>
            </el-table-column>
            <el-table-column label="关键词" width="160">
              <template #default="{ row }">
                <span class="text-muted">{{ row.keywords.join('、') || '无关键词' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="覆盖程度" width="190">
              <template #default="{ row }">
                <div class="inline-row">
                  <el-tag :type="tierType[row.tier]" effect="plain">{{ tierLabel[row.tier] }}</el-tag>
                  <el-tag v-if="row.approximate" type="info" effect="plain">按关键词近似匹配</el-tag>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="`改动对照（${version.diff.length}）`" name="diff">
          <EmptyState v-if="groups.length === 0" state="no-diff" />

          <div v-for="group in groups" :key="`${group.sectionKind}:${group.itemId}`" class="diff-group">
            <h3 class="diff-group-title">
              {{ group.sectionTitle }} · {{ group.itemLabel || '未命名条目' }}
            </h3>

            <el-card v-for="entry in group.entries" :key="entry.bulletId" class="diff-card">
              <div class="inline-row diff-tags">
                <el-tag v-if="entry.change === 'keep'" type="success" effect="plain">保留</el-tag>
                <el-tag v-else-if="entry.change === 'rewrite'" type="warning" effect="plain">改写</el-tag>
                <el-tag v-else type="danger" effect="plain">已移除</el-tag>
                <el-tag v-if="entry.placement === 'to-end'" type="info" effect="plain">移至末尾</el-tag>
                <span class="text-muted">{{ entry.reason }}</span>
              </div>

              <el-row :gutter="12" class="diff-columns">
                <el-col :span="12">
                  <div class="diff-column-label">简历原文</div>
                  <div class="diff-text diff-text--from">{{ entry.fromText }}</div>
                </el-col>
                <el-col :span="12">
                  <div class="diff-column-label">版本文本</div>
                  <div v-if="entry.toText" class="diff-text diff-text--to">{{ entry.toText }}</div>
                  <div v-else class="diff-text diff-text--removed">
                    未进入这一版，简历里仍然保留
                  </div>
                </el-col>
              </el-row>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`未覆盖要求（${version.uncovered.length}）`" name="uncovered">
          <EmptyState v-if="version.uncovered.length === 0" state="all-covered" />
          <el-table v-else :data="version.uncovered" size="small">
            <el-table-column label="JD 原句" min-width="320">
              <template #default="{ row }">{{ row.text }}</template>
            </el-table-column>
            <el-table-column label="关键词" width="160">
              <template #default="{ row }">
                <span class="text-muted">{{ row.keywords.join('、') || '无关键词' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="240">
              <template #default="{ row }">
                <div class="inline-row">
                  <el-tag :type="row.reason === 'planned-only' ? 'warning' : 'info'" effect="plain">
                    {{ row.reason === 'planned-only' ? '只有规划性表述' : '你的简历中没有对应事实' }}
                  </el-tag>
                </div>
                <div class="text-muted">{{ row.explanation }}</div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<style scoped>
.description {
  margin: 0 0 var(--space-md);
}

.integrity-alert {
  margin-top: var(--space-md);
}

.version-body {
  margin: 0;
  padding: var(--space-lg);
  background: var(--paper);
  border: 1px solid var(--xiaoyi-border);
  border-radius: var(--radius-md);
  line-height: 1.9;
}

.diff-group {
  margin-bottom: var(--space-xl);
}

.diff-group-title {
  margin: 0 0 var(--space-md);
  font-size: var(--text-md);
}

.diff-card {
  margin-bottom: var(--space-md);
}

.diff-tags {
  margin-bottom: var(--space-md);
}

.diff-columns {
  margin-top: var(--space-xs);
}

.diff-column-label {
  margin-bottom: var(--space-xs);
  font-size: var(--text-xs);
  color: var(--xiaoyi-muted);
}

.diff-text {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  line-height: 1.7;
}

.diff-text--from {
  background: var(--ink-80);
  color: var(--ink-700);
}

.diff-text--to {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.diff-text--removed {
  background: var(--severity-high-soft);
  color: var(--severity-high-ink);
}
</style>
