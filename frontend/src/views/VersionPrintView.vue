<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ResumePreview from '@/components/ResumePreview.vue'
import { useVersionStore } from '@/stores/versions'

const route = useRoute()
const router = useRouter()
const versionStore = useVersionStore()

const printed = ref(false)

const version = computed(() => versionStore.byId(String(route.params.id)))

/** 版本分区没有稳定 id，用 kind 补一个，供纸面锚点使用。 */
const paperSections = computed(() =>
  (version.value?.sections ?? []).map((section) => ({ ...section, id: section.kind })),
)

function print(): void {
  printed.value = true
  window.print()
}

onMounted(() => {
  if (!version.value) {
    router.replace('/versions')
    return
  }
  window.print()
})
</script>

<template>
  <div class="print-page">
    <div class="print-bar">
      <el-button text size="small" @click="router.back()">返回</el-button>
      <el-button size="small" type="primary" @click="print">打印 / 另存为 PDF</el-button>
      <span v-if="printed" class="text-muted">已调起打印，请在打印对话框里选择「另存为 PDF」</span>
    </div>

    <ResumePreview
      v-if="version"
      :sections="paperSections"
      :profile="version.profile ?? { name: '', headline: '', contacts: [] }"
    />
  </div>
</template>

<style scoped>
.print-page {
  min-height: 100%;
  background: var(--desk);
}

.print-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--paper);
  border-bottom: 1px solid var(--xiaoyi-border);
}
</style>

<style>
@media print {
  .print-bar {
    display: none !important;
  }

  .print-page {
    background: var(--paper) !important;
  }
}
</style>
