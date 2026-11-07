<script setup lang="ts">
import { computed } from 'vue'

import { EMPTY_STATES, type EmptyState } from '@xiaoyi/shared/domain/states'

const props = defineProps<{
  /** 状态表里的哪一条空状态。 */
  state: EmptyState
  /**
   * 主动作的文案。
   * 不同页面的下一步不一样时由调用方给——诊断页就地发起诊断，
   * 编辑页则是跳到诊断页去。
   */
  actionLabel?: string
}>()

const emit = defineEmits<{
  action: []
}>()

const action = computed(() => props.actionLabel ?? EMPTY_STATES[props.state].action)
</script>

<template>
  <div class="sidebar-empty">
    <p class="sidebar-empty-title">{{ EMPTY_STATES[state].title }}</p>
    <p class="sidebar-empty-text">{{ EMPTY_STATES[state].hint }}</p>
    <el-button v-if="action" text size="small" @click="emit('action')">{{ action }}</el-button>
  </div>
</template>

<style scoped>
.sidebar-empty {
  padding: var(--space-md) var(--space-xs);
}

.sidebar-empty-title {
  margin: 0 0 var(--space-xs);
  font-size: var(--text-sm);
  font-weight: 600;
}

.sidebar-empty-text {
  margin: 0 0 var(--space-md);
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--ink-500);
}
</style>
