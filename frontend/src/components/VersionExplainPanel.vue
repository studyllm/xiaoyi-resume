<script setup lang="ts">
import { computed, ref } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import type { VersionExplain } from '@xiaoyi/shared/domain/types'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{
  /** 这一版的生成经过。老版本没有这个——显示空态。 */
  explain?: VersionExplain
}>()

const emit = defineEmits<{
  /** 用户想去看改动对照。 */
  gotoDiff: []
}>()

const uiStore = useUiStore()

/** 要点条数超过这个数就折叠起来。 */
const COLLAPSE_AFTER = 20

const expanded = ref(false)

const explain = computed(() => props.explain)
const bullets = computed(() => props.explain?.bullets ?? [])
const visibleBullets = computed(() =>
  expanded.value ? bullets.value : bullets.value.slice(0, COLLAPSE_AFTER),
)
const hasMore = computed(() => bullets.value.length > COLLAPSE_AFTER)

/** 窄屏：表格换成一条一条的卡片，列并排会挤成一团。 */
const stacked = computed(() => uiStore.viewportTier === 'compact' || uiStore.viewportTier === 'too-small')

const outcomeLabel: Record<string, string> = {
  keep: '保留',
  rewrite: '改写',
  remove: '已移除',
}

const outcomeType: Record<string, 'success' | 'warning' | 'info'> = {
  keep: 'success',
  rewrite: 'warning',
  remove: 'info',
}

const stageLabel: Record<string, string> = {
  analyze: '比对',
  rewrite: '改写',
}

/** 这一版有没有用到模型。 */
const usedModel = computed(() => (explain.value?.model.calls ?? []).length > 0)
</script>

<template>
  <EmptyState v-if="!explain" state="no-generation-trace" />

  <div v-else class="explain">
    <!-- ① 生成经过 -->
    <section class="explain-section">
      <h3 class="explain-title">生成经过</h3>
      <p class="explain-line">
        抽到 {{ explain.pipeline.requirementCount }} 条要求 →
        比对了 {{ explain.pipeline.comparedBullets }} 条要点（简历里共
        {{ explain.pipeline.totalBullets }} 条）→
        进了这一版 {{ explain.pipeline.keptBullets }} 条 →
        校验 {{ explain.pipeline.checked }} 条
      </p>
      <p class="explain-line">
        <template v-if="usedModel">模型改写 {{ explain.pipeline.modelRewritten }} 条</template>
        <template v-else>这次没有用模型，全部由规则引擎生成</template>
        <template v-if="explain.pipeline.reverted > 0">
          ，有 {{ explain.pipeline.reverted }} 处没有通过校验，换回了规则引擎的产出
        </template>
      </p>
    </section>

    <!-- ② 模型调用 -->
    <section v-if="usedModel" class="explain-section">
      <h3 class="explain-title">模型调用</h3>
      <el-table :data="explain.model.calls" size="small">
        <el-table-column label="这一步" width="80">
          <template #default="{ row }">{{ stageLabel[row.stage] ?? row.stage }}</template>
        </el-table-column>
        <el-table-column label="模型" min-width="140">
          <template #default="{ row }">
            <span class="text-muted">{{ row.model }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提示词版本" min-width="160">
          <template #default="{ row }">
            <span class="text-muted mono">{{ row.promptVersion }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发出多少条要点" width="120">
          <template #default="{ row }">{{ row.bulletsSent }}</template>
        </el-table-column>
        <el-table-column label="token" min-width="150">
          <template #default="{ row }">
            <span class="text-muted">进 {{ row.promptTokens }} · 出 {{ row.completionTokens }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.degraded" type="warning" effect="plain">没调通</el-tag>
            <el-tag v-else type="success" effect="plain">用上了</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="explain.model.calls.some((call) => call.degradeReason)" class="explain-note">
        {{
          explain.model.calls.find((call) => call.degradeReason)?.degradeReason
        }}
      </p>
    </section>

    <!-- ③ 要点取舍 -->
    <section class="explain-section">
      <h3 class="explain-title">要点取舍</h3>
      <div v-if="stacked" class="explain-stack">
        <div v-for="entry in visibleBullets" :key="entry.bulletId" class="explain-card">
          <div class="explain-card-head">
            <span class="explain-card-where">
              {{ entry.sectionTitle }}
              <template v-if="entry.itemLabel"> · {{ entry.itemLabel }}</template>
            </span>
            <el-tag :type="outcomeType[entry.outcome]" effect="plain">
              {{ outcomeLabel[entry.outcome] }}
            </el-tag>
          </div>
          <p class="explain-card-text">{{ entry.reason }}</p>
          <p class="text-muted explain-card-meta">
            <template v-if="entry.compared">参与比对了</template>
            <template v-else>没有参与比对</template>
            <template v-if="entry.writtenBy === 'model'"> · 这句是模型写的</template>
          </p>
        </div>
      </div>
      <el-table v-else :data="visibleBullets" size="small">
        <el-table-column label="分区" width="100">
          <template #default="{ row }">{{ row.sectionTitle }}</template>
        </el-table-column>
        <el-table-column label="条目" min-width="140">
          <template #default="{ row }">
            <span class="text-muted">{{ row.itemLabel || '未命名条目' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="outcomeType[row.outcome]" effect="plain">
              {{ outcomeLabel[row.outcome] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="依据" min-width="220">
          <template #default="{ row }">
            <span class="text-muted">{{ row.reason }}</span>
          </template>
        </el-table-column>
        <el-table-column label="参与比对" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.compared" type="info" effect="plain">参与了</el-tag>
            <el-tag v-else type="info" effect="plain">没参与</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="命中了哪几条要求" min-width="200">
          <template #default="{ row }">
            <span class="text-muted">
              {{ row.matchedRequirements.join('；') || '没有命中要求' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="" width="110">
          <template #default>
            <el-button text size="small" @click="emit('gotoDiff')">看改动对照</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="hasMore" class="explain-more">
        <el-button v-if="!expanded" text size="small" @click="expanded = true">
          展开全部 {{ bullets.length }} 条
        </el-button>
        <el-button v-else text size="small" @click="expanded = false">收起</el-button>
      </div>
    </section>

    <!-- ④ 模型改写与换回 -->
    <section v-if="explain.rewrites.length > 0" class="explain-section">
      <h3 class="explain-title">模型改写与换回</h3>
      <el-table :data="explain.rewrites" size="small">
        <el-table-column label="模型写的" min-width="220">
          <template #default="{ row }">
            <span class="text-muted">{{ row.modelText }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最终采用的" min-width="220">
          <template #default="{ row }">{{ row.finalText }}</template>
        </el-table-column>
        <el-table-column label="换回原因" min-width="200">
          <template #default="{ row }">
            <span v-if="row.rejectedReason" class="text-muted">{{ row.rejectedReason }}</span>
            <span v-else class="text-muted">通过了校验</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="110">
          <template #default>
            <el-button text size="small" @click="emit('gotoDiff')">看改动对照</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.explain {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.explain-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.explain-title {
  margin: 0;
  font-size: var(--text-md);
}

.explain-line {
  margin: 0;
  color: var(--ink-700);
  line-height: 1.8;
}

.explain-note {
  margin: 0;
  color: var(--ink-500);
}

.explain-more {
  display: flex;
  justify-content: flex-start;
}

.explain-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.explain-card {
  padding: var(--space-md);
  border: 1px solid var(--ink-150);
  border-radius: var(--radius-md);
}

.explain-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.explain-card-where {
  font-size: var(--text-sm);
  color: var(--ink-700);
}

.explain-card-text {
  margin: 0 0 var(--space-xs);
  color: var(--ink-700);
  line-height: 1.7;
}

.explain-card-meta {
  margin: 0;
  font-size: var(--text-xs);
}
</style>
