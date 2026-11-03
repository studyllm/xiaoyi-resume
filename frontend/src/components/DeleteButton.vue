<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'

defineProps<{
  /** 正在确认删除吗——确认态由父组件统一裁决，避免多处同时显示确认 */
  confirming: boolean
  /** 删除按钮的标题，也是它的无障碍名 */
  deleteTitle: string
}>()

const emit = defineEmits<{
  request: []
  confirm: []
  cancel: []
}>()
</script>

<template>
  <span class="paper-action">
    <el-button
      v-if="!confirming"
      size="small"
      text
      :icon="Delete"
      class="paper-delete"
      :title="deleteTitle"
      :aria-label="deleteTitle"
      @click="emit('request')"
    />
    <template v-else>
      <el-button size="small" text type="danger" @click="emit('confirm')">确认删除？</el-button>
      <el-button size="small" text @click="emit('cancel')">取消</el-button>
    </template>
  </span>
</template>

<style scoped>
.paper-action {
  margin-left: var(--space-sm);
}
</style>
