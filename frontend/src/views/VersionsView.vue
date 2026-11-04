<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { CopyDocument, Delete, Document, Download, Plus, View } from '@element-plus/icons-vue'

import EmptyState from '@/components/EmptyState.vue'
import { maskForbiddenWords } from '@/engines/forbidden'
import { EMPTY_STATES, FAILURE_STATES, stateHint, stateMessage } from '@/domain/states'
import { useDraftStore } from '@/stores/draft'
import { useVersionStore } from '@/stores/versions'

const router = useRouter()
const draftStore = useDraftStore()
const versionStore = useVersionStore()

const versions = computed(() => versionStore.versions)

function jdSummary(text: string): string {
  const masked = maskForbiddenWords(text).replace(/\s+/g, ' ').trim()
  return masked.length > 48 ? `${masked.slice(0, 48)}…` : masked
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function copyBody(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('正文已复制')
  } catch {
    ElMessage.error(stateMessage(FAILURE_STATES['copy-failed']))
  }
}

function exportPdf(id: string): void {
  router.push(`/versions/${id}/print`)
}

function remove(id: string): void {
  versionStore.remove(id)
  ElMessage.success('版本已删除')
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">多 JD 版本</h1>
        <p class="page-subtitle">
          每一个版本都是生成那一刻的简历快照。简历之后怎么改，都不会回写已经生成的版本。
        </p>
      </div>
    </div>

    <el-card class="card-block draft-entry">
      <div class="inline-row">
        <el-icon><Document /></el-icon>
        <div class="draft-entry-text">
          <strong>我的简历</strong>
          <div class="text-muted">
            {{
              draftStore.hasDraft
                ? `当前修订号 ${draftStore.draft?.revision}，共 ${versionStore.versions.length} 个版本`
                : stateHint(EMPTY_STATES['no-draft'])
            }}
          </div>
        </div>
        <el-button
          type="primary"
          size="small"
          :icon="Plus"
          @click="router.push(draftStore.hasDraft ? '/draft' : '/import')"
        >
          {{ draftStore.hasDraft ? '打开我的简历' : '导入简历' }}
        </el-button>
      </div>
    </el-card>

    <el-alert
      v-if="versions.length > 20"
      class="card-block"
      type="warning"
      show-icon
      :closable="false"
      title="版本数量偏多，建议清理一些旧版本"
      description="系统不会自动删除任何版本，每个版本都是一份独立的快照，需要你自己确认后删除。"
    />

    <EmptyState v-if="versions.length === 0" state="no-versions" @action="router.push('/jd')" />

    <div v-else class="version-cards">
      <el-card v-for="version in versions" :key="version.id" class="version-card" shadow="never">
        <div class="version-card-head">
          <el-link type="primary" class="version-card-name" @click="router.push(`/versions/${version.id}`)">
            {{ version.name }}
          </el-link>
          <el-tag type="info" effect="plain" size="small">
            简历修订号 {{ version.draftRevision }}
          </el-tag>
        </div>

        <p class="version-card-jd">{{ jdSummary(version.jdRawText) }}</p>

        <div class="version-card-meta">
          <span class="text-muted">生成于 {{ formatTime(version.createdAt) }}</span>
        </div>

        <div class="version-card-actions">
          <el-button
            size="small"
            text
            type="primary"
            :icon="View"
            @click="router.push(`/versions/${version.id}`)"
          >
            打开
          </el-button>
          <el-button size="small" text :icon="CopyDocument" @click="copyBody(version.body)">
            复制纯文本
          </el-button>
          <el-button size="small" text :icon="Download" @click="exportPdf(version.id)">
            导出 PDF
          </el-button>
          <el-popconfirm
            title="删除这个版本？简历和其它版本不受影响。"
            confirm-button-text="删除"
            cancel-button-text="取消"
            @confirm="remove(version.id)"
          >
            <template #reference>
              <el-button
                size="small"
                text
                :icon="Delete"
                class="paper-delete"
                title="删除这个版本"
                aria-label="删除这个版本"
              >
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.version-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-md);
}

.version-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.version-card-name {
  font-size: var(--text-md);
  font-weight: 600;
}

.version-card-jd {
  margin: var(--space-sm) 0 var(--space-md);
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--ink-500);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 生成时间一行，操作按钮另起一行：窄卡片里挤在一行会把时间顶开 */
.version-card-meta {
  padding-top: var(--space-sm);
  border-top: 1px solid var(--ink-150);
  font-size: var(--text-xs);
}

/* 操作按钮与生成时间左对齐：按钮自身的内边距会让第一个图标缩进去 */
.version-card-actions {
  display: flex;
  align-items: center;
  /* 组件库自带 .el-button + .el-button 的 12px 间距，这里只补上剩下的 */
  gap: var(--space-xs);
  /* 按钮在这一行里均分，删除落在最右 */
  justify-content: space-between;
  margin-top: var(--space-sm);
}

.version-card-actions :deep(.el-button) {
  padding-left: 0;
  padding-right: 0;
}

.draft-entry-text {
  flex: 1;
}
</style>
