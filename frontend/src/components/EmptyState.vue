<script setup lang="ts">
import { EMPTY_STATES, type EmptyState } from '@xiaoyi/shared/domain/states'

defineProps<{
  /** 状态表里的哪一条空状态。 */
  state: EmptyState
}>()

const emit = defineEmits<{
  /** 用户点了空状态里的主动作。 */
  action: []
}>()
</script>

<template>
  <el-empty>
    <template #description>
      <p class="empty-state-title">{{ EMPTY_STATES[state].title }}</p>
      <p class="empty-state-desc">{{ EMPTY_STATES[state].hint }}</p>
    </template>
    <el-button v-if="EMPTY_STATES[state].action" type="primary" @click="emit('action')">
      {{ EMPTY_STATES[state].action }}
    </el-button>
  </el-empty>
</template>
