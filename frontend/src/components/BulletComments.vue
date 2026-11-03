<script setup lang="ts">
import type { DiagnosisIssue } from '@/domain/types'

defineProps<{
  /** 这条要点下的批注 */
  issues: DiagnosisIssue[]
  /** 是不是展开着 */
  expanded: boolean
}>()

const emit = defineEmits<{
  toggle: []
  select: [issue: DiagnosisIssue]
}>()

function severityOf(issues: DiagnosisIssue[]): 'high' | 'medium' | 'low' {
  if (issues.some((issue) => issue.severity === 'high')) return 'high'
  if (issues.some((issue) => issue.severity === 'medium')) return 'medium'
  return 'low'
}

/** 收起时给的那行摘要：说的是问题本身，不是被批的那句话。 */
function stripSummary(issues: DiagnosisIssue[]): string {
  if (issues.length === 0) return ''
  return issues[0]!.problem
}
</script>

<template>
  <div class="paper-comment">
    <button
      type="button"
      class="comment-strip"
      :class="`comment-strip--${severityOf(issues)}`"
      @click="emit('toggle')"
    >
      <span class="comment-strip-count">
        {{ issues.length }} 条批注
      </span>
      <span class="comment-strip-summary" v-show="!expanded">
        {{ stripSummary(issues) }}
      </span>
      <span class="comment-strip-toggle">
        {{ expanded ? '收起' : '展开' }}
      </span>
    </button>

    <ul v-if="expanded" class="comment-inline">
      <li
        v-for="issue in issues"
        :id="`paper-comment-${issue.id}`"
        :key="issue.id"
        class="comment-inline-row"
        :class="`comment-inline-row--${issue.severity}`"
        @click="emit('select', issue)"
      >
        <span class="comment-inline-text">{{ issue.problem }}</span>
        <span class="comment-inline-suggestion">{{ issue.suggestion }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.paper-comment {
  margin-top: 4px;
}

/* 纸面上的批注：一行细标注，不占地方，也一眼看得出不是简历正文 */
.comment-strip {
  display: flex;
  align-items: baseline;
  gap: 6px;
  /* 左边缩进 14px，宽度要跟着减，不然「展开」会挂到版心外面 */
  width: calc(100% - 14px);
  margin-left: 14px;
  padding: 1px 0 1px 10px;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  text-align: left;
  color: var(--ink-500);
  background: transparent;
  border: none;
  border-left: 2px solid var(--severity-medium);
  cursor: pointer;
}

.comment-strip--high {
  border-left-color: var(--severity-high);
}

.comment-strip--low {
  border-left-color: var(--severity-low);
}

.comment-strip:hover {
  color: var(--brand);
}

.comment-strip-count {
  font-weight: 600;
  color: var(--ink-700);
  flex-shrink: 0;
}

.comment-strip-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-strip-toggle {
  margin-left: auto;
  flex-shrink: 0;
}

/* 展开后每条批注一行：问题和建议，完整的批注卡在右侧批注栏 */
.comment-inline {
  margin: 2px 0 2px 14px;
  padding: 0;
  list-style: none;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  line-height: 1.7;
}

.comment-inline-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
}

.comment-inline-row::before {
  content: '';
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--severity-medium);
}

.comment-inline-row--high::before {
  background: var(--severity-high);
}

.comment-inline-row--low::before {
  background: var(--severity-low);
}

.comment-inline-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-700);
}

.comment-inline-suggestion {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-500);
}
</style>
