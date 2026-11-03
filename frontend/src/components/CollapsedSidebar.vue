<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue'

import type { Severity } from '@/domain/types'
import { useUiStore } from '@/stores/ui'

defineProps<{
  /** 还有几条没处理 */
  pendingCount: number
  /** 保存时查出的结构问题有几处 */
  structureCount: number
  /** 各严重度还有几条 */
  severityCounts: { severity: Severity; label: string; count: number }[]
}>()

const emit = defineEmits<{
  /** 点某个严重度，展开侧栏并只看这一档 */
  filterSeverity: [severity: Severity]
}>()

const uiStore = useUiStore()
</script>

<template>
  <div class="sidebar-collapsed">
    <el-button size="small" text :icon="ArrowLeft" @click="uiStore.setSidebarCollapsed(false)" />
    <span class="collapsed-title">批注</span>
    <span class="collapsed-total">{{ pendingCount }}</span>
    <span
      v-if="structureCount > 0"
      class="collapsed-structure"
      :title="`保存时发现的 ${structureCount} 处结构问题`"
    >
      ⚠ {{ structureCount }}
    </span>
    <button
      v-for="entry in severityCounts"
      :key="entry.severity"
      type="button"
      class="collapsed-severity"
      :class="`collapsed-severity--${entry.severity}`"
      :title="`${entry.label} ${entry.count} 条`"
      :disabled="entry.count === 0"
      @click="emit('filterSeverity', entry.severity)"
    >
      <span class="collapsed-dot" />
      <span class="collapsed-count">{{ entry.count }}</span>
    </button>
  </div>
</template>

<style scoped>
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

.collapsed-structure {
  font-size: 11px;
  font-weight: 600;
  color: var(--severity-medium-ink);
}
</style>
