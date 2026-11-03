<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'

import type { DraftContact } from '@/domain/types'

defineProps<{
  contacts: DraftContact[]
  editable: boolean
  /** 正在确认删除的是第几条——-1 表示没有 */
  confirmingIndex: number
}>()

const emit = defineEmits<{
  update: [index: number, patch: Partial<DraftContact>]
  'request-delete': [index: number]
  'confirm-delete': [index: number]
  'cancel-delete': []
}>()
</script>

<template>
  <span v-if="!editable" class="paper-contacts-text">
    {{ contacts.map((contact) => contact.value).join(' · ') }}
  </span>
  <template v-else>
    <span v-for="(contact, index) in contacts" :key="index" class="paper-contact">
      <el-input
        :model-value="contact.label"
        borderless
        class="paper-input paper-input--label"
        placeholder="标签"
        @update:model-value="(value: string) => emit('update', index, { label: value })"
      />
      <el-input
        :model-value="contact.value"
        borderless
        class="paper-input"
        placeholder="内容"
        @update:model-value="(value: string) => emit('update', index, { value })"
      />
      <el-button
        v-if="confirmingIndex !== index"
        size="small"
        text
        :icon="Delete"
        class="paper-delete"
        title="删除这个联系方式"
        aria-label="删除这个联系方式"
        @click="emit('request-delete', index)"
      />
      <template v-else>
        <el-button size="small" text type="danger" @click="emit('confirm-delete', index)">
          确认删除？
        </el-button>
        <el-button size="small" text @click="emit('cancel-delete')">取消</el-button>
      </template>
    </span>
  </template>
</template>

<style scoped>
.paper-contacts-text {
  font-family: var(--font-paper);
  color: var(--ink-500);
}

/* 纸面上的行内编辑：看起来是正文，不是输入框 */
.paper-input :deep(.el-input__wrapper),
.paper-input :deep(.el-input__inner) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.paper-input :deep(.el-input__inner) {
  font-family: var(--font-paper);
  font-size: inherit;
  color: inherit;
}

.paper-input--label :deep(.el-input__inner) {
  color: var(--ink-500);
}

.paper-contact {
  display: flex;
  width: 100%;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

/* 标签只占短词的宽度，内容吃掉这一行剩下的位置，长邮箱才放得下 */
.paper-contact .paper-input--label {
  flex: 0 0 4.5em;
  width: 4.5em;
}

.paper-contact .paper-input:not(.paper-input--label) {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.paper-contact .paper-delete {
  flex: 0 0 auto;
}
</style>
