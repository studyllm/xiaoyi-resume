<script setup lang="ts">
import type { StructureFinding } from '@xiaoyi/shared/engines/structure'

defineProps<{
  findings: StructureFinding[]
}>()

const emit = defineEmits<{
  locate: [finding: StructureFinding]
}>()

/** 结构问题出在哪：条目级报条目，分区级报分区。 */
function anchorOf(finding: StructureFinding): string {
  if (finding.itemId) return `${finding.sectionTitle} · ${finding.itemLabel || '未命名条目'}`
  return finding.sectionTitle
}
</script>

<template>
  <section class="structure-panel">
    <p class="structure-panel-title">
      <span class="structure-panel-dot" />
      保存时发现的 {{ findings.length }} 处问题
    </p>
    <button
      v-for="finding in findings"
      :key="`${finding.ruleId}@${finding.itemId || finding.sectionId}`"
      type="button"
      class="structure-item"
      @click="emit('locate', finding)"
    >
      <span class="structure-item-label">{{ finding.label }}</span>
      <span class="structure-item-anchor">{{ anchorOf(finding) }}</span>
    </button>
  </section>
</template>

<style scoped>
.structure-panel {
  padding: var(--space-md) var(--space-md);
  background: var(--severity-medium-soft);
  border-bottom: 1px solid var(--severity-medium);
}

.structure-panel-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: 0 0 var(--space-sm);
  font-size: var(--text-xs);
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
  padding: var(--space-xs) 0;
  font-size: var(--text-xs);
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
</style>
