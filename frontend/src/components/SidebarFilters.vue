<script setup lang="ts">
import { CATEGORY_LABELS, type DiagnosisCategory } from '@xiaoyi/shared/domain/types'

defineProps<{
  severity: string
  category: string
  categories: DiagnosisCategory[]
}>()

const emit = defineEmits<{
  'update:severity': [value: string]
  'update:category': [value: string]
}>()
</script>

<template>
  <div class="sidebar-filters">
    <el-select
      :model-value="severity"
      size="small"
      placeholder="严重度"
      @update:model-value="(value: string) => emit('update:severity', value)"
    >
      <el-option label="全部严重度" value="all" />
      <el-option label="高" value="high" />
      <el-option label="中" value="medium" />
      <el-option label="低" value="low" />
    </el-select>
    <el-select
      :model-value="category"
      size="small"
      placeholder="类别"
      @update:model-value="(value: string) => emit('update:category', value)"
    >
      <el-option label="全部类别" value="all" />
      <el-option
        v-for="item in categories"
        :key="item"
        :label="CATEGORY_LABELS[item]"
        :value="item"
      />
    </el-select>
  </div>
</template>

<style scoped>
.sidebar-filters {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.sidebar-filters :deep(.el-select) {
  flex: 1;
  min-width: 0;
}
</style>
