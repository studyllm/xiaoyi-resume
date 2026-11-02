<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <el-dialog
    :model-value="uiStore.unsavedChoicePending"
    title="还有未保存的修改"
    width="440px"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    align-center
  >
    <p class="unsaved-lead">这份简历有还没保存的修改，离开前先定一下怎么办。</p>
    <ul class="unsaved-options">
      <li><b>保存并离开</b>：存一次，修订号加一</li>
      <li><b>放弃修改并离开</b>：回到上次保存的样子</li>
      <li><b>留在本页</b>：接着改</li>
    </ul>

    <template #footer>
      <el-button type="primary" @click="uiStore.resolveUnsavedChoice('save')">保存并离开</el-button>
      <el-button @click="uiStore.resolveUnsavedChoice('discard')">放弃修改并离开</el-button>
      <el-button text @click="uiStore.resolveUnsavedChoice('stay')">留在本页</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.unsaved-lead {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--ink-700);
}

.unsaved-options {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--ink-500);
  line-height: 1.9;
}
</style>
