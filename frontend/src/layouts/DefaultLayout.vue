<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Document, Files, MagicStick, Promotion } from '@element-plus/icons-vue'

import { productName } from '@/config/product'
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { rendersWorkbench, usesDrawer } from '@xiaoyi/shared/domain/breakpoints'
import { useViewport } from '@/composables/useViewport'
import {
  ALL_STATES,
  FAILURE_STATES,
  stateHint,
  stateTitle,
} from '@xiaoyi/shared/domain/states'
import { useDraftStore } from '@/stores/draft'
import { persistence } from '@/stores/persistence'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

const brandName = productName()

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const draftStore = useDraftStore()
const uiStore = useUiStore()

useViewport()

const isPublic = computed(() => route.meta.public === true)

/** 这一档下侧栏是不是覆盖式的抽屉。 */
const drawerMode = computed(() => usesDrawer(uiStore.viewportTier))
/** 屏幕太小就只给降级提示，工作台整块不渲染。 */
const workbenchVisible = computed(() => rendersWorkbench(uiStore.viewportTier))
const navOpen = ref(false)

function closeNav(): void {
  navOpen.value = false
}

// 换页面就把抽屉收起来——否则新页面还压着一层侧栏
watch(() => route.path, closeNav)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeNav()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** 编辑页时，侧栏下半部分给出当前简历的分区目录。 */
const outline = computed(() => {
  if (route.name !== 'draft' || !draftStore.draft) return []
  const sections = draftStore.draft.sections.map((section) => ({
    id: section.id,
    title: section.title,
    count: section.items.length,
  }))
  // 基础信息在抬头里，不是一个分区，因此没有条目数
  return [{ id: 'profile', title: '基础信息', count: undefined }, ...sections]
})

function jumpToSection(sectionId: string): void {
  uiStore.requestScrollToSection(sectionId)
}

const activeMenu = computed(() => {
  if (route.name === 'version-detail') return '/versions'
  return route.path
})

async function logout(): Promise<void> {
  await session.logout()
  router.push('/')
}
</script>

<template>
  <router-view v-if="isPublic" />

  <div v-else-if="!workbenchVisible" class="layout-too-small">
    <BrandLogo variant="bar" />
    <h1 class="layout-too-small-title">请在更大的屏幕上使用</h1>
    <p class="layout-too-small-text">
      这份简历要在一张 A4 纸上编辑和对照，手机屏幕放不下。把窗口拉宽到 768 像素以上，或者换一台屏幕更宽的电脑。
    </p>
  </div>

  <el-container v-else class="layout" :class="{ 'is-nav-open': navOpen }">
    <el-header class="layout-header">
      <div class="inline-row">
        <el-button
          v-if="drawerMode"
          class="layout-nav-toggle"
          size="small"
          text
          :aria-label="navOpen ? '收起导航' : '打开导航'"
          :aria-expanded="navOpen"
          @click="navOpen = !navOpen"
        >
          导航
        </el-button>
        <router-link to="/" class="layout-title" title="回到首页">
          <BrandLogo variant="bar" />
          <span>{{ brandName }}</span>
        </router-link>
        <el-tag type="warning" effect="plain">演示模式</el-tag>
      </div>
      <div class="inline-row">
        <el-tag v-if="draftStore.hasDraft" type="info" effect="plain">
          简历修订号 {{ draftStore.savedRevision }}
        </el-tag>
        <el-button
          size="small"
          :icon="Promotion"
          @click="router.push('/import')"
        >
          {{ draftStore.hasDraft ? '更换简历' : '导入简历' }}
        </el-button>
        <el-dropdown v-if="session.isLoggedIn">
          <span class="inline-row">
            <el-avatar :size="28">{{ session.user?.email?.slice(0, 1) ?? '匿' }}</el-avatar>
            <span>{{ session.user?.email }}</span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <div class="demo-strip" aria-hidden="true" />

    <el-alert
      v-if="!persistence.persistent"
      class="layout-banner"
      type="error"
      show-icon
      :closable="false"
      :title="stateTitle(FAILURE_STATES['storage-unavailable'])"
      :description="stateHint(FAILURE_STATES['storage-unavailable'])"
    />

    <div
      v-if="drawerMode && navOpen"
      class="layout-backdrop"
      aria-hidden="true"
      @click="closeNav"
    />

    <el-alert
      v-if="session.offline"
      class="layout-banner layout-offline"
      type="warning"
      show-icon
      :closable="false"
      :title="stateTitle(ALL_STATES['offline'])"
      :description="stateHint(ALL_STATES['offline'])"
    />

    <el-container class="layout-body">
      <el-aside
        width="200px"
        class="layout-aside"
        :class="{ 'is-drawer': drawerMode }"
        :inert="drawerMode && !navOpen ? '' : undefined"
      >
        <el-menu :default-active="activeMenu" :default-openeds="['work', 'deliver']" router>
          <el-sub-menu index="work">
            <template #title>
              <el-icon><Document /></el-icon>
              <span>工作</span>
            </template>
            <el-menu-item index="/draft">
              <el-icon><Document /></el-icon>
              <span>我的简历</span>
            </el-menu-item>
            <el-menu-item index="/diagnosis">
              <el-icon><MagicStick /></el-icon>
              <span>简历诊断</span>
            </el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="deliver">
            <template #title>
              <el-icon><Promotion /></el-icon>
              <span>交付</span>
            </template>
            <el-menu-item index="/jd">
              <el-icon><Promotion /></el-icon>
              <span>按 JD 生成</span>
            </el-menu-item>
            <el-menu-item index="/versions">
              <el-icon><Files /></el-icon>
              <span>多 JD 版本</span>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>

        <nav v-if="outline.length > 0" class="sidebar-outline">
          <div class="sidebar-outline-title">本份简历</div>
          <button
            v-for="entry in outline"
            :key="entry.id"
            type="button"
            class="sidebar-outline-item"
            @click="jumpToSection(entry.id)"
          >
            <span>{{ entry.title }}</span>
            <span v-if="entry.count !== undefined" class="sidebar-outline-count">{{ entry.count }}</span>
          </button>
        </nav>

        <div class="sidebar-foot">
          原型演示模式 · 解析、诊断与版本生成均为本地规则模拟，数据仅保存在本机浏览器
        </div>
      </el-aside>

      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>

    <UnsavedChangesDialog />
  </el-container>
</template>

<style scoped>
.layout {
  height: 100%;
}

.layout-header {
  height: var(--layout-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--paper);
  border-bottom: 1px solid var(--xiaoyi-border);
}

.layout-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--xiaoyi-text);
  text-decoration: none;
  transition: color 0.15s ease;
}

.layout-title:hover {
  color: var(--brand);
}

/* 演示模式提示：顶栏下一条低饱和细线，完整说明放在侧栏底部 */
.demo-strip {
  height: 2px;
  background: linear-gradient(
    90deg,
    var(--severity-medium) 0%,
    var(--severity-medium-soft) 40%,
    transparent 100%
  );
}

.layout-banner {
  border-radius: 0;
}

.sidebar-outline {
  padding: var(--space-md) var(--space-md);
  border-top: 1px solid var(--ink-150);
}

.sidebar-outline-title {
  margin-bottom: var(--space-sm);
  font-size: var(--text-2xs);
  color: var(--ink-500);
}

.sidebar-outline-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-sm);
  text-align: left;
  color: var(--ink-700);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.sidebar-outline-item:hover {
  background: var(--ink-80);
  color: var(--brand);
}

.sidebar-outline-count {
  font-size: var(--text-2xs);
  color: var(--ink-500);
}

.sidebar-foot {
  margin-top: auto;
  padding: var(--space-md);
  font-size: var(--text-2xs);
  line-height: 1.6;
  color: var(--ink-500);
  border-top: 1px solid var(--ink-150);
}

/* 内层容器是外层 flex 容器的子项。flex 项默认 min-height:auto 会被内容顶开，
   于是它撑破 100% 的高度，最后滚动的是整个页面而不是内容区。 */
.layout-body {
  flex: 1;
  min-height: 0;
}

.layout-aside {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  background: var(--paper);
  border-right: 1px solid var(--ink-150);
}

/* 抽屉态：侧栏覆盖在内容之上，不占内容区的宽度。
   推开内容会让正在看的纸面跳位置，编辑中的用户会失去上下文。 */
.layout-aside.is-drawer {
  position: fixed;
  top: var(--layout-header-height);
  bottom: 0;
  left: 0;
  z-index: 20;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}

.layout.is-nav-open .layout-aside.is-drawer {
  transform: translateX(0);
}

.layout-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: var(--ink-900);
  opacity: 0.32;
}

.layout-too-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  height: 100%;
  padding: var(--space-xl);
  text-align: center;
}

.layout-too-small-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
}

.layout-too-small-text {
  max-width: 32em;
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.8;
  color: var(--ink-500);
}

.el-main.layout-main {
  min-height: 0;
  overflow-y: auto;
  /* 组件库默认 20px。页边距只由各页自己的内容区给出，避免和 .page 叠成两套 */
  padding: 0;
}
</style>
