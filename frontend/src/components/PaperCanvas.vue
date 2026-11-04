<script setup lang="ts">
import { ref } from 'vue'

import { usePaperScale } from '@/composables/usePaperScale'

defineProps<{
  /** 纸面区域的状态。变化时向读屏软件播报。 */
  status?: string
}>()

const host = ref<HTMLElement | null>(null)
const { scale } = usePaperScale(host)
</script>

<template>
  <div ref="host" class="paper-canvas" role="region" aria-label="简历正文">
    <!-- 只给内层加缩放：外层负责量宽度，量到的必须是缩放前的真实可用宽度 -->
    <div class="paper-canvas-page" :style="{ zoom: scale }">
      <slot />
    </div>
    <p class="sr-only" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style>
@media print {
  /* 打印稿必须是 A4 原尺寸：缩放只发生在屏幕这一侧 */
  .paper-canvas-page {
    zoom: 1 !important;
  }
}
</style>
