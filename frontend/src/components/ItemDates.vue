<script setup lang="ts">
import type { YearMonth } from '@xiaoyi/shared/domain/time'

defineProps<{
  start?: YearMonth | null
  end?: YearMonth | null
  present?: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  update: [patch: { start?: YearMonth | null; end?: YearMonth | null; present?: boolean }]
}>()

/** 只读的起止时间文本，如「2021-03 - 至今」。 */
function dateRange(start?: YearMonth | null, end?: YearMonth | null, present?: boolean): string {
  if (!start && !end) return ''
  const from = start ?? ''
  const to = present ? '至今' : (end ?? '')
  if (!to) return from
  if (!from) return to
  return `${from} - ${to}`
}
</script>

<template>
  <span v-if="!editable" class="paper-dates-text">{{ dateRange(start, end, present) }}</span>
  <template v-else>
    <!-- 日期选择器的根是 Fragment，拿不到 scoped 属性，用一层带 scope 的元素承接样式 -->
    <span class="paper-date-field">
      <el-date-picker
        :model-value="start ?? undefined"
        type="month"
        value-format="YYYY-MM"
        placeholder="开始年月"
        @update:model-value="(value: string | null) => emit('update', { start: value })"
      />
    </span>
    <span class="paper-date-sep">–</span>
    <span class="paper-date-field">
      <el-date-picker
        :model-value="end ?? undefined"
        type="month"
        value-format="YYYY-MM"
        placeholder="结束年月"
        :disabled="present"
        @update:model-value="(value: string | null) => emit('update', { end: value })"
      />
    </span>
    <el-checkbox
      :model-value="present ?? false"
      class="paper-present"
      @update:model-value="(value: string | number | boolean) => emit('update', { present: Boolean(value) })"
    >
      至今
    </el-checkbox>
  </template>
</template>

<style scoped>
.paper-dates-text {
  font-family: var(--font-paper);
  color: var(--ink-500);
}

.paper-date-field :deep(.el-input__wrapper) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.paper-date-field :deep(.el-input__inner) {
  font-family: var(--font-paper);
  font-size: var(--paper-text-xs);
  color: var(--ink-500);
}

/* 时间选择器默认 220px，两个并排就把公司和职位挤没了 */
.paper-date-field :deep(.el-date-editor) {
  width: 88px;
}

.paper-date-sep {
  color: var(--ink-500);
  margin: 0 var(--space-3xs);
}

.paper-present {
  margin-left: var(--space-xs);
}

.paper-present :deep(.el-checkbox__label) {
  font-family: var(--font-paper);
  font-size: var(--paper-text-xs);
  color: var(--ink-500);
}
</style>
