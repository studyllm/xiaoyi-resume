<script setup lang="ts">
import { computed } from 'vue'
import { EditPen, Check, Close, Hide } from '@element-plus/icons-vue'

import { CATEGORY_LABELS, SEVERITY_LABELS, type DiagnosisIssue } from '@/domain/types'
import { anchorText } from '@/engines/anchor'

const props = defineProps<{
  issue: DiagnosisIssue
  active: boolean
  handled: boolean
  changed: boolean
}>()

const emit = defineEmits<{
  select: []
  edit: []
  toggleHandled: []
  ignore: []
}>()

const anchor = computed(() => anchorText(props.issue))

const severityType = computed(() => {
  if (props.issue.severity === 'high') return 'danger'
  if (props.issue.severity === 'medium') return 'warning'
  return 'info'
})
</script>

<template>
  <article
    :id="`comment-${issue.id}`"
    class="comment"
    :class="[
      `comment--${issue.severity}`,
      { 'comment--active': active, 'comment--handled': handled },
    ]"
    @click="emit('select')"
  >
    <header class="comment-head">
      <el-tag :type="severityType" size="small" effect="dark">
        {{ SEVERITY_LABELS[issue.severity] }}
      </el-tag>
      <el-tag size="small" type="info" effect="plain">
        {{ CATEGORY_LABELS[issue.category] }}
      </el-tag>
      <el-tag v-if="handled" size="small" type="success" effect="plain">已处理</el-tag>
      <el-tag v-else-if="changed" size="small" type="warning" effect="plain">已改</el-tag>
    </header>

    <p v-if="anchor" class="comment-anchor">▸ {{ anchor }}</p>

    <p class="comment-problem">{{ issue.problem }}</p>

    <div class="comment-suggestion">
      <strong>建议怎么改：</strong>{{ issue.suggestion }}
    </div>

    <footer class="comment-actions" @click.stop>
      <el-button size="small" text type="primary" :icon="EditPen" @click="emit('edit')">
        去修改
      </el-button>
      <el-button size="small" text :icon="handled ? Close : Check" @click="emit('toggleHandled')">
        {{ handled ? '标记为未处理' : '标记已处理' }}
      </el-button>
      <el-button size="small" text :icon="Hide" @click="emit('ignore')">忽略此条</el-button>
    </footer>
  </article>
</template>

<style scoped>
.comment {
  padding: var(--space-md) var(--space-md);
  margin-bottom: var(--space-md);
  background: var(--paper);
  border: 1px solid var(--xiaoyi-border);
  border-left: 3px solid var(--ink-300);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.comment--active {
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.comment--handled {
  opacity: 0.55;
}

.comment--high {
  border-left-color: var(--severity-high);
}

.comment--medium {
  border-left-color: var(--severity-medium);
}

.comment--low {
  border-left-color: var(--severity-low);
}

.comment-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
}

.comment-anchor {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-xs);
  color: var(--severity-medium-ink);
  background: var(--severity-medium-soft);
  padding: var(--space-3xs) var(--space-sm);
  border-radius: var(--radius-sm);
}

.comment-problem {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.comment-suggestion {
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--ink-700);
}

.comment-actions {
  display: flex;
  gap: var(--space-3xs);
  margin-top: var(--space-xs);
}
</style>
