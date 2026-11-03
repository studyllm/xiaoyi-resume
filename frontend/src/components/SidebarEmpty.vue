<script setup lang="ts">
import type { DiagnosisState } from '@/domain/types'

defineProps<{
  /** 诊断到了哪一步：还没诊断过、诊断过但没有意见 */
  state: DiagnosisState
  /** 空状态里那个按钮的文案，不同页面的下一步不一样 */
  actionLabel: string
}>()

const emit = defineEmits<{
  startDiagnosis: []
}>()
</script>

<template>
  <div v-if="state === 'none'" class="sidebar-empty">
    <p class="sidebar-empty-title">还没有诊断结果</p>
    <p class="sidebar-empty-text">诊断会指出这份简历缺什么、哪里不顺，并给出改写建议。</p>
    <el-button text size="small" @click="emit('startDiagnosis')">
      {{ actionLabel }}
    </el-button>
  </div>
  <div v-else class="sidebar-empty">
    <p class="sidebar-empty-title">没有查出问题</p>
    <p class="sidebar-empty-text">
      这份简历暂时没有查出需要修改的地方。改过简历之后可以再诊断一次。
    </p>
    <el-button text size="small" @click="emit('startDiagnosis')">重新诊断</el-button>
  </div>
</template>

<style scoped>
.sidebar-empty {
  padding: 12px 4px;
}

.sidebar-empty-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.sidebar-empty-text {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-500);
}
</style>
