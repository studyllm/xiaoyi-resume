<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import IdentityDialog from '@/components/IdentityDialog.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import ResumePreview, { type PreviewHighlight } from '@/components/ResumePreview.vue'
import { SHOWCASE_COMMENTS, SHOWCASE_FRAGMENT_SECTIONS } from '@/mock/showcase'
import { loadDemoData } from '@/mock/loadDemo'
import { FAILURE_STATES, stateMessage } from '@xiaoyi/shared/domain/states'
import { useDraftStore } from '@/stores/draft'

const router = useRouter()
const route = useRoute()
const draftStore = useDraftStore()

const identityOpen = ref(false)
/** 确认身份后要继续去的页面。 */
const pendingRedirect = ref('')

/** 首屏展示用的简历：把三条批注锚到对应的要点上。 */
const showcaseHighlights = computed<PreviewHighlight[]>(() =>
  SHOWCASE_COMMENTS.map((comment) => ({
    bulletId: findBulletId(comment.anchor),
    fragment: comment.anchor,
    severity: comment.severity,
  })),
)

function findBulletId(anchor: string): string {
  for (const section of SHOWCASE_FRAGMENT_SECTIONS) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        if (bullet.text === anchor) return bullet.id
      }
    }
  }
  return ''
}

/** 主动作：直接把人送进产品，不在见到价值之前先问身份。 */
function enterProduct(): void {
  router.push(draftStore.hasDraft ? '/draft' : '/import')
}

function onIdentified(): void {
  identityOpen.value = false
  const target = pendingRedirect.value
  pendingRedirect.value = ''
  if (target) router.push(target)
}

function startDemo(): void {
  const result = loadDemoData()
  if (!result.draftSaved) {
    ElMessage.warning(
      result.failure
        ? stateMessage(result.failure.state, result.failure.vars)
        : stateMessage(FAILURE_STATES['demo-load-failed']),
    )
    return
  }
  router.push('/jd')
}

/** 守卫把未登录用户带回落地页时带着目标页，据此自动打开身份对话框。 */
function openFromQuery(redirect: unknown): void {
  if (typeof redirect !== 'string' || !redirect) return
  pendingRedirect.value = redirect
  identityOpen.value = true
  // 打开后就把地址里的目标页去掉，避免再次回到落地页时又弹一次
  router.replace({ path: '/', query: {} })
}

onMounted(() => openFromQuery(route.query.redirect))
watch(() => route.query.redirect, openFromQuery)

const features = [
  {
    title: '一份结构化简历',
    body: '教育、经历、项目、技能与其它五个分区，要点带稳定标识，诊断意见和版本改动都锚定到具体句子。',
  },
  {
    title: '只看简历的诊断',
    body: '只指出「只有职责没有结果」「表述空泛」「时间线不顺」，不输出分数，也不会自动改写你的稿子。',
  },
  {
    title: '不编造的版本',
    body: '按 JD 生成的版本只重组、删减和措辞规范化，不会写出你简历里没有的公司、项目或数字。',
  },
]
</script>

<template>
  <div class="landing">
    <header class="landing-header">
      <div class="landing-container landing-header-inner">
        <span class="landing-brand">
          <BrandLogo variant="landing" />
          <span>小奕·简历</span>
        </span>
        <el-tag type="warning" effect="plain">原型演示模式</el-tag>
      </div>
    </header>

    <main class="landing-main">
      <section class="landing-container landing-hero">
        <div class="landing-hero-text">
          <h1 class="landing-title">一份简历，按 JD 生成多个互不影响的版本</h1>

          <p class="landing-lead">
            放入一份简历，系统整理成可编辑的结构化简历。粘贴一份 JD，得到一版针对该岗位的简历。
            你的简历一直保留，每一个版本都是生成那一刻的快照。
          </p>

          <div class="inline-row landing-actions">
            <el-button type="primary" size="large" @click="enterProduct">
              {{ draftStore.hasDraft ? '打开我的简历' : '导入我的简历' }}
            </el-button>
            <el-button size="large" @click="startDemo">用示例简历试一遍</el-button>
          </div>

          <ul class="landing-features">
            <li v-for="feature in features" :key="feature.title" class="feature">
              <h2 class="feature-title">{{ feature.title }}</h2>
              <p class="feature-body">{{ feature.body }}</p>
            </li>
          </ul>
        </div>

        <div class="landing-showcase">
          <div class="landing-showcase-canvas paper-canvas">
            <ResumePreview
              variant="fragment"
              :sections="SHOWCASE_FRAGMENT_SECTIONS"
              :highlights="showcaseHighlights"
            />
          </div>

          <div class="landing-showcase-comments">
            <article
              v-for="comment in SHOWCASE_COMMENTS"
              :key="comment.anchor"
              class="showcase-comment"
              :class="`is-${comment.severity}`"
            >
              <div class="showcase-comment-head">
                <span class="showcase-comment-dot" />
                <p class="showcase-comment-anchor">{{ comment.anchor }}</p>
              </div>
              <p class="showcase-comment-problem">{{ comment.problem }}</p>
              <p class="showcase-comment-suggestion">{{ comment.suggestion }}</p>
            </article>
          </div>
        </div>
      </section>

    </main>

    <footer class="landing-footer">
      <div class="landing-container">
        <p class="landing-footer-text">
          原型演示模式 · 解析、诊断与版本生成均为本地规则模拟，未接入真实模型；数据仅保存在本机浏览器
        </p>
      </div>
    </footer>

    <IdentityDialog
      v-model="identityOpen"
      reason="continue"
      @confirmed="onIdentified"
    />
  </div>
</template>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: linear-gradient(180deg, var(--desk) 0%, var(--paper) 320px);
}

/* 顶栏与主内容共用一个容器，左右边缘对齐 */
.landing-container {
  width: 100%;
  max-width: var(--landing-width);
  margin: 0 auto;
  padding: 0 var(--space-lg);
}

.landing-header {
  background: var(--paper);
  border-bottom: 1px solid var(--ink-150);
}

.landing-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-md);
  padding-bottom: var(--space-md);
}

.landing-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-lg);
  font-weight: 600;
}

.landing-main {
  flex: 1;
  padding-top: var(--space-2xl);
  padding-bottom: var(--space-2xl);
}

.landing-hero {
  display: grid;
  /* 文案栏固定 560px：标题一行放得下（实测 528px），剩下的都给样例区 */
  grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
  column-gap: var(--space-2xl);
  align-items: start;
}

.landing-title {
  margin: 0 0 var(--space-md);
  font-size: var(--text-2xl);
  line-height: 1.4;
  font-weight: 600;
}

.landing-lead {
  margin: 0 0 var(--space-xl);
  font-size: var(--text-lg);
  line-height: 1.9;
  color: var(--ink-500);
}

.landing-actions {
  gap: var(--space-md);
}

/* 样例区：纸落在桌面上，批注在纸的右边。两根柱子一样高才不显得散 */
.landing-showcase {
  display: grid;
  grid-template-columns: minmax(0, 400px) minmax(0, 1fr);
  gap: var(--space-lg);
  align-items: start;
}

.landing-showcase-canvas {
  padding: var(--space-xl);
}

.landing-showcase-comments {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.showcase-comment {
  padding: var(--space-md);
  background: var(--paper);
  border: 1px solid var(--ink-150);
  border-left: 3px solid var(--ink-300);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
}

.showcase-comment-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.showcase-comment-dot {
  flex: 0 0 auto;
  width: var(--space-sm);
  height: var(--space-sm);
  margin-top: var(--space-sm);
  border-radius: 50%;
  background: var(--ink-300);
}

.showcase-comment-anchor {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  line-height: 1.6;
}

.showcase-comment-problem {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.showcase-comment-suggestion {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--ink-500);
}

/* 批注的颜色跟着自己的严重度走，与纸面上的高亮同一套色 */
.showcase-comment.is-high {
  border-left-color: var(--severity-high);
}

.showcase-comment.is-medium {
  border-left-color: var(--severity-medium);
}

.showcase-comment.is-low {
  border-left-color: var(--severity-low);
}

.showcase-comment.is-high .showcase-comment-dot {
  background: var(--severity-high);
}

.showcase-comment.is-medium .showcase-comment-dot {
  background: var(--severity-medium);
}

.showcase-comment.is-low .showcase-comment-dot {
  background: var(--severity-low);
}

.showcase-comment.is-high .showcase-comment-anchor {
  background: var(--severity-high-soft);
  color: var(--severity-high-ink);
}

.showcase-comment.is-medium .showcase-comment-anchor {
  background: var(--severity-medium-soft);
  color: var(--severity-medium-ink);
}

.showcase-comment.is-low .showcase-comment-anchor {
  background: var(--severity-low-soft);
  color: var(--severity-low-ink);
}

/* 特性清单放在文案栏里，和样例区一样高，首屏才不会一半空着 */
.landing-features {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin: var(--space-2xl) 0 0;
  padding: var(--space-lg) 0 0;
  border-top: 1px solid var(--ink-150);
  list-style: none;
}

.feature-title {
  margin: 0 0 var(--space-xs);
  font-size: var(--text-base);
  font-weight: 600;
}

.feature-body {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.8;
  color: var(--ink-500);
}

.landing-footer {
  padding-top: var(--space-md);
  padding-bottom: var(--space-md);
  background: var(--paper);
  border-top: 1px solid var(--ink-150);
}

.landing-footer-text {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.7;
  text-align: center;
  color: var(--ink-500);
}

@media (max-width: 1100px) {
  .landing-hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-showcase {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-showcase-canvas {
    max-width: 400px;
    justify-self: center;
  }
}
</style>
