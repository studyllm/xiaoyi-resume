<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'

import CollapsedSidebar from '@/components/CollapsedSidebar.vue'
import DiagnosisComment from '@/components/DiagnosisComment.vue'
import SidebarEmpty from '@/components/SidebarEmpty.vue'
import SidebarFilters from '@/components/SidebarFilters.vue'
import StructureFindingsPanel from '@/components/StructureFindingsPanel.vue'
import type { EmptyState } from '@xiaoyi/shared/domain/states'
import {
  SEVERITY_LABELS,
  type DiagnosisCategory,
  type DiagnosisIssue,
  type DiagnosisState,
  type Severity,
} from '@xiaoyi/shared/domain/types'
import type { StructureFinding } from '@xiaoyi/shared/engines/structure'
import { useUiStore } from '@/stores/ui'

const props = withDefaults(
  defineProps<{
    issues: DiagnosisIssue[]
    isHandled: (id: string) => boolean
    isChanged: (id: string) => boolean
    isIgnored: (issue: DiagnosisIssue) => boolean
    /** 诊断到了哪一步：还没诊断过、诊断过但没有意见、有意见。 */
    diagnosisState?: DiagnosisState
    /** 「还没有诊断结果」时那个按钮的文案，不同页面的下一步不一样。 */
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

/** 筛选条件有没有生效。 */
const filterActive = computed(
  () => severityFilter.value !== 'all' || categoryFilter.value !== 'all',
)

const visible = computed(() =>
  props.issues.filter((issue) => {
    if (props.isIgnored(issue)) return false
    if (severityFilter.value !== 'all' && issue.severity !== severityFilter.value) return false
    if (categoryFilter.value !== 'all' && issue.category !== categoryFilter.value) return false
    return true
  }),
)

/**
 * 栏里现在该显示哪一种空状态。
 *
 * 「还没诊断」「诊断过但零意见」「有意见但被筛掉了」是三件不同的事，
 * 混成一句「没有符合条件的批注」会让用户以为诊断没跑过。
 */
const emptyState = computed<EmptyState | null>(() => {
  if (props.diagnosisState === 'none') return 'no-diagnosis'
  if (props.diagnosisState === 'empty') return 'no-diagnosis-issues'
  if (visible.value.length > 0) return null
  return filterActive.value ? 'comments-filtered' : 'comments-ignored'
})

/** 只有「还没诊断」这一步在不同页面下不一样，其余的用状态表里的话。 */
const emptyActionLabel = computed(() =>
  emptyState.value === 'no-diagnosis' ? props.emptyActionLabel : undefined,
)

/** 空状态里的动作：筛空时清掉筛选，其余是发起诊断。 */
function onEmptyAction(): void {
  if (emptyState.value === 'comments-filtered') {
    severityFilter.value = 'all'
    categoryFilter.value = 'all'
    return
  }
  emit('startDiagnosis')
}

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
    <StructureFindingsPanel
      v-if="!uiStore.commentSidebarCollapsed && structureFindings.length > 0"
      :findings="structureFindings"
      @locate="(finding: StructureFinding) => emit('locate', finding)"
    />

    <header class="sidebar-head">
      <template v-if="uiStore.commentSidebarCollapsed">
        <CollapsedSidebar
          :pending-count="pendingCount"
          :structure-count="structureFindings.length"
          :severity-counts="pendingBySeverity"
          @filter-severity="(severity: Severity) => filterBySeverity(severity)"
        />
      </template>
      <template v-else>
        <div class="inline-row">
          <span class="sidebar-title">批注</span>
          <el-tag size="small" type="info" effect="plain">{{ issues.length }}</el-tag>
          <el-tag v-if="pendingCount > 0" size="small" type="warning" effect="plain">
            待处理 {{ pendingCount }}
          </el-tag>
          <el-button
            size="small"
            text
            :icon="ArrowRight"
            aria-label="收起批注栏"
            @click="uiStore.setSidebarCollapsed(true)"
          />
        </div>

        <SidebarFilters
          v-model:severity="severityFilter"
          v-model:category="categoryFilter"
          :categories="categories"
        />
      </template>
    </header>

    <div v-if="!uiStore.commentSidebarCollapsed" class="sidebar-body">
      <SidebarEmpty
        v-if="emptyState"
        :state="emptyState"
        :action-label="emptyActionLabel"
        @action="onEmptyAction"
      />
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
.sidebar-head {
  padding: var(--space-md) var(--space-md);
  border-bottom: 1px solid var(--xiaoyi-border);
}

.comment-sidebar.is-collapsed .sidebar-head {
  padding: var(--space-md) var(--space-sm);
}

.sidebar-title {
  font-weight: 600;
}

/* 保存时发现的结构问题：栏顶单独一块，与下面的批注分开 */
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-md);
}
</style>
