<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

import DiagnosisComment from '@/components/DiagnosisComment.vue'
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  type DiagnosisCategory,
  type DiagnosisIssue,
  type DiagnosisState,
  type Severity,
} from '@/domain/types'
import type { StructureFinding } from '@/engines/structure'
import { useUiStore } from '@/stores/ui'

const props = withDefaults(
  defineProps<{
    issues: DiagnosisIssue[]
    isHandled: (id: string) => boolean
    isChanged: (id: string) => boolean
    isIgnored: (issue: DiagnosisIssue) => boolean
    /** 诊断到了哪一步：还没诊断过、诊断过但没有意见、有意见。 */
    diagnosisState?: DiagnosisState
    /** 空状态里那个按钮的文案，不同页面的下一步不一样。 */
    emptyActionLabel?: string
    /** 保存时查出来的结构问题，显示在栏的顶部 */
    structureFindings?: StructureFinding[]
  }>(),
  {
    diagnosisState: 'none',
    emptyActionLabel: '开始诊断',
    structureFindings: () => [],
  },
)

const emit = defineEmits<{
  select: [issue: DiagnosisIssue]
  edit: [issue: DiagnosisIssue]
  toggleHandled: [issue: DiagnosisIssue]
  ignore: [issue: DiagnosisIssue]
  /** 用户要发起诊断。由页面决定是就地诊断还是跳到诊断页。 */
  startDiagnosis: []
  /** 用户点了结构问题里的一条，要跳到出问题的那个字段 */
  locate: [finding: StructureFinding]
}>()

const uiStore = useUiStore()

/** 低于这个宽度，纸 + 批注栏 + 应用侧栏就放不下了，批注栏收成图标条。 */
const NARROW_WIDTH = 1360

/** 栏里有没有东西可展示。 */
function hasContent(): boolean {
  return props.issues.length > 0 || props.structureFindings.length > 0
}

/**
 * 内容变了要不要收起。
 * 还没诊断时保持展开——空状态里的引导要看得见。
 * 诊断过却没有意见时收起来，把地方让给简历。
 * 有意见时展开：用户刚看完诊断，批注要露出来。
 */
function syncByContent(): void {
  if (props.diagnosisState === 'none') {
    uiStore.autoCollapseSidebar(false)
    return
  }
  if (!hasContent()) {
    uiStore.autoCollapseSidebar(true)
    return
  }
  uiStore.autoCollapseSidebar(false)
}

/**
 * 视口变了要不要收起：窄屏时把地方让给简历。
 * 没东西可展示时按内容规则收起，不按视口展开。
 */
function syncToViewport(): void {
  if (props.diagnosisState === 'none') {
    uiStore.autoCollapseSidebar(false)
    return
  }
  if (!hasContent()) {
    uiStore.autoCollapseSidebar(true)
    return
  }
  uiStore.autoCollapseSidebar(window.innerWidth < NARROW_WIDTH)
}

const severityFilter = ref<string>('all')
const categoryFilter = ref<string>('all')

const visible = computed(() =>
  props.issues.filter((issue) => {
    if (props.isIgnored(issue)) return false
    if (severityFilter.value !== 'all' && issue.severity !== severityFilter.value) return false
    if (categoryFilter.value !== 'all' && issue.category !== categoryFilter.value) return false
    return true
  }),
)

const handledCount = computed(() => visible.value.filter((issue) => props.isHandled(issue.id)).length)
const pendingCount = computed(() => visible.value.length - handledCount.value)

/** 折叠时也让人看得见里面有几条高危问题。 */
const pendingBySeverity = computed(() => {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 }
  for (const issue of props.issues) {
    if (props.isIgnored(issue)) continue
    if (props.isHandled(issue.id)) continue
    counts[issue.severity] += 1
  }
  return (['high', 'medium', 'low'] as Severity[]).map((severity) => ({
    severity,
    label: SEVERITY_LABELS[severity],
    count: counts[severity],
  }))
})

/** 结构问题出在哪：条目级报条目，分区级报分区。 */
function anchorOf(finding: StructureFinding): string {
  if (finding.itemId) return `${finding.sectionTitle} · ${finding.itemLabel || '未命名条目'}`
  return finding.sectionTitle
}

/** 点某个严重度，展开侧栏并只看这一档。 */
function filterBySeverity(severity: Severity): void {
  uiStore.setSidebarCollapsed(false)
  severityFilter.value = severity
}

const categories = computed(() =>
  [...new Set(props.issues.map((issue) => issue.category))] as DiagnosisCategory[],
)

watch(
  // 诊断状态、批注条数、结构问题条数，任一变了都重新判断要不要收起
  () => `${props.diagnosisState}:${props.issues.length}:${props.structureFindings.length}`,
  syncByContent,
  { immediate: true },
)

onMounted(() => {
  syncToViewport()
  window.addEventListener('resize', syncToViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncToViewport)
})
</script>

<template>
  <aside class="comment-sidebar" :class="{ 'is-collapsed': uiStore.commentSidebarCollapsed }">
    <section
      v-if="!uiStore.commentSidebarCollapsed && structureFindings.length > 0"
      class="structure-panel"
    >
      <p class="structure-panel-title">
        <span class="structure-panel-dot" />
        保存时发现的 {{ structureFindings.length }} 处问题
      </p>
      <button
        v-for="finding in structureFindings"
        :key="`${finding.ruleId}@${finding.itemId || finding.sectionId}`"
        type="button"
        class="structure-item"
        @click="emit('locate', finding)"
      >
        <span class="structure-item-label">{{ finding.label }}</span>
        <span class="structure-item-anchor">{{ anchorOf(finding) }}</span>
      </button>
    </section>

    <header class="sidebar-head">
      <template v-if="uiStore.commentSidebarCollapsed">
        <div class="sidebar-collapsed">
          <el-button size="small" text :icon="ArrowLeft" @click="uiStore.setSidebarCollapsed(false)" />
          <span class="collapsed-title">批注</span>
          <span class="collapsed-total">{{ pendingCount }}</span>
          <span
            v-if="structureFindings.length > 0"
            class="collapsed-structure"
            :title="`保存时发现的 ${structureFindings.length} 处结构问题`"
          >
            ⚠ {{ structureFindings.length }}
          </span>
          <button
            v-for="entry in pendingBySeverity"
            :key="entry.severity"
            type="button"
            class="collapsed-severity"
            :class="`collapsed-severity--${entry.severity}`"
            :title="`${entry.label} ${entry.count} 条`"
            :disabled="entry.count === 0"
            @click="filterBySeverity(entry.severity)"
          >
            <span class="collapsed-dot" />
            <span class="collapsed-count">{{ entry.count }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <div class="inline-row">
          <span class="sidebar-title">批注</span>
          <el-tag size="small" type="info" effect="plain">{{ issues.length }}</el-tag>
          <el-tag v-if="pendingCount > 0" size="small" type="warning" effect="plain">
            待处理 {{ pendingCount }}
          </el-tag>
          <el-button size="small" text :icon="ArrowRight" @click="uiStore.setSidebarCollapsed(true)" />
        </div>

        <div class="sidebar-filters">
          <el-select v-model="severityFilter" size="small" placeholder="严重度">
            <el-option label="全部严重度" value="all" />
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
          </el-select>
          <el-select v-model="categoryFilter" size="small" placeholder="类别">
            <el-option label="全部类别" value="all" />
            <el-option
              v-for="category in categories"
              :key="category"
              :label="CATEGORY_LABELS[category]"
              :value="category"
            />
          </el-select>
        </div>
      </template>
    </header>

    <div v-if="!uiStore.commentSidebarCollapsed" class="sidebar-body">
      <div v-if="diagnosisState === 'none'" class="sidebar-empty">
        <p class="sidebar-empty-title">还没有诊断结果</p>
        <p class="sidebar-empty-text">诊断会指出这份简历缺什么、哪里不顺，并给出改写建议。</p>
        <el-button text size="small" @click="emit('startDiagnosis')">
          {{ emptyActionLabel }}
        </el-button>
      </div>
      <div v-else-if="diagnosisState === 'empty'" class="sidebar-empty">
        <p class="sidebar-empty-title">没有查出问题</p>
        <p class="sidebar-empty-text">
          这份简历暂时没有查出需要修改的地方。改过简历之后可以再诊断一次。
        </p>
        <el-button text size="small" @click="emit('startDiagnosis')">重新诊断</el-button>
      </div>
      <el-empty v-else-if="visible.length === 0" description="没有符合条件的批注" :image-size="60" />
      <DiagnosisComment
        v-for="issue in visible"
        :key="issue.id"
        :issue="issue"
        :active="uiStore.activeCommentId === issue.id"
        :handled="isHandled(issue.id)"
        :changed="isChanged(issue.bulletId)"
        @select="emit('select', issue)"
        @edit="emit('edit', issue)"
        @toggle-handled="emit('toggleHandled', issue)"
        @ignore="emit('ignore', issue)"
      />
    </div>
  </aside>
</template>

<style scoped>
.comment-sidebar {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex-shrink: 0;
  background: var(--paper);
  border-left: 1px solid var(--xiaoyi-border);
}

.comment-sidebar.is-collapsed {
  width: 56px;
}

/* 折叠成窄条时也要看得见里面有什么 */
.sidebar-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.collapsed-title {
  font-size: 11px;
  color: var(--ink-500);
}

.collapsed-total {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-700);
}

.collapsed-severity {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  font-size: 11px;
  color: var(--ink-700);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.collapsed-severity:disabled {
  opacity: 0.4;
  cursor: default;
}

.collapsed-severity:hover:not(:disabled) {
  background: var(--ink-80);
}

.collapsed-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--severity-medium);
}

.collapsed-severity--high .collapsed-dot {
  background: var(--severity-high);
}

.collapsed-severity--low .collapsed-dot {
  background: var(--severity-low);
}

.sidebar-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--xiaoyi-border);
}

.comment-sidebar.is-collapsed .sidebar-head {
  padding: 10px 6px;
}

.sidebar-title {
  font-weight: 600;
}

/* 保存时发现的结构问题：栏顶单独一块，与下面的批注分开 */
.structure-panel {
  padding: 10px 12px;
  background: var(--severity-medium-soft);
  border-bottom: 1px solid var(--severity-medium);
}

.structure-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--severity-medium-ink);
}

.structure-panel-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--severity-medium);
}

.structure-item {
  display: block;
  width: 100%;
  padding: 4px 0;
  font-size: 12px;
  text-align: left;
  color: var(--ink-700);
  background: transparent;
  border: none;
  cursor: pointer;
}

.structure-item:hover .structure-item-label {
  color: var(--brand);
}

.structure-item-label {
  font-weight: 600;
  color: var(--severity-medium-ink);
}

.structure-item-anchor {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-500);
}

.collapsed-structure {
  font-size: 11px;
  font-weight: 600;
  color: var(--severity-medium-ink);
}

.sidebar-filters {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.sidebar-filters :deep(.el-select) {
  flex: 1;
  min-width: 0;
}

.sidebar-empty {
  padding: 12px 4px;
}
.sidebar-empty-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.sidebar-empty-text {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-500);
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}
</style>
