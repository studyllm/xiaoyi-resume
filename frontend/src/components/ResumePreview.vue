<script setup lang="ts">
import { computed } from 'vue'

import { EMPTY_PROFILE, type SectionKind } from '@/domain/types'

export interface PreviewBullet {
  id: string
  text: string
}

export interface PreviewItem {
  id: string
  org?: string
  title?: string
  start?: string | null
  end?: string | null
  present?: boolean
  bullets: PreviewBullet[]
}

export interface PreviewSection {
  kind: SectionKind
  title: string
  id: string
  items: PreviewItem[]
}

export interface PreviewHighlight {
  sectionId?: string
  itemId?: string
  bulletId?: string
  fragment?: string
  severity?: 'high' | 'medium' | 'low'
}

const emit = defineEmits<{
  'item-focusout': [section: PreviewSection, item: PreviewItem]
}>()

const props = withDefaults(
  defineProps<{
    sections: PreviewSection[]
    profile?: { name: string; headline: string; contacts: { label: string; value: string }[] }
    highlights?: PreviewHighlight[]
    /** 编辑模式下条目字段常驻渲染，空条目也有输入框可填 */
    editable?: boolean
    /** 片段：落地页样例区展示的一段简历，宽度与内边距都收紧 */
    variant?: 'page' | 'fragment'
  }>(),
  {
    profile: () => ({ ...EMPTY_PROFILE }),
    highlights: () => [],
    editable: false,
    variant: 'page',
  },
)

const profile = computed(() => props.profile ?? EMPTY_PROFILE)

const highlightByBullet = computed(() => {
  const map = new Map<string, PreviewHighlight>()
  for (const highlight of props.highlights) {
    if (highlight.bulletId) map.set(highlight.bulletId, highlight)
  }
  return map
})

const highlightByItem = computed(() => {
  const map = new Map<string, PreviewHighlight>()
  for (const highlight of props.highlights) {
    if (highlight.itemId && !highlight.bulletId) map.set(highlight.itemId, highlight)
  }
  return map
})

const highlightBySection = computed(() => {
  const map = new Map<string, PreviewHighlight>()
  for (const highlight of props.highlights) {
    if (highlight.sectionId && !highlight.itemId) map.set(highlight.sectionId, highlight)
  }
  return map
})

function sectionKey(section: PreviewSection): string {
  return section.id
}

/** 专业技能只有一行行技能，没有公司、职位与时间。 */
function showFields(section: PreviewSection): boolean {
  return section.kind !== 'skills'
}

function dateLabel(item: PreviewItem): string {
  if (!item.start) return ''
  if (item.present) return `${item.start} - 至今`
  if (item.end) return `${item.start} - ${item.end}`
  return item.start
}

function parts(text: string, fragment?: string): { before: string; mark: string; after: string } {
  if (!fragment) return { before: text, mark: '', after: '' }
  const index = text.indexOf(fragment)
  if (index === -1) return { before: text, mark: '', after: '' }
  return {
    before: text.slice(0, index),
    mark: fragment,
    after: text.slice(index + fragment.length),
  }
}

function bulletParts(text: string, bulletId: string): { before: string; mark: string; after: string } {
  const highlight = highlightByBullet.value.get(bulletId)
  if (!highlight) return { before: text, mark: '', after: '' }
  return parts(text, highlight.fragment)
}

function severityClass(severity?: string): string {
  if (severity === 'high') return 'is-high'
  if (severity === 'medium') return 'is-medium'
  if (severity === 'low') return 'is-low'
  return ''
}
</script>

<template>
  <div class="resume-preview" :class="`is-${variant}`">
    <article class="resume-paper">
      <!-- 编辑时抬头始终渲染：还没有姓名的时候也得有地方填 -->
      <header
        v-if="editable || profile.name || profile.headline || profile.contacts.length > 0"
        id="anchor-section-profile"
        class="paper-header"
      >
        <h2 class="paper-section-title paper-profile-title">基础信息</h2>
        <div class="paper-header-body">
          <h1 v-if="editable || profile.name" class="paper-name">
            <slot name="profile-name" :profile="profile">{{ profile.name }}</slot>
          </h1>
          <p v-if="editable || profile.headline" class="paper-headline">
            <slot name="profile-headline" :profile="profile">{{ profile.headline }}</slot>
          </p>
          <p v-if="profile.contacts.length > 0" class="paper-contacts">
            <slot name="profile-contacts" :profile="profile">{{
              profile.contacts.map((contact) => contact.value).join(' · ')
            }}</slot>
          </p>
        </div>
      </header>
      <!-- 新增入口放在抬头灰底外面，和分区的新增按钮同一套样式 -->
      <slot v-if="editable" name="profile-add" :profile="profile" />

      <section
        v-for="section in sections"
        :id="`anchor-section-${section.id}`"
        :key="section.kind"
        class="paper-section"
        :data-section-id="section.id"
      >
        <h2
          class="paper-section-title"
          :class="[
            highlightBySection.has(sectionKey(section)) ? 'is-marked' : '',
            severityClass(highlightBySection.get(sectionKey(section))?.severity),
          ]"
        >
          {{ section.title }}
        </h2>

        <div
          v-for="item in section.items"
          :id="`anchor-item-${item.id}`"
          :key="item.id"
          class="paper-item"
          :data-item-id="item.id"
          @focusout="emit('item-focusout', section, item)"
        >
          <div
            v-if="showFields(section)"
            class="paper-item-head"
            :class="[
              editable ? 'is-editable' : '',
              highlightByItem.has(item.id) ? 'is-marked' : '',
              severityClass(highlightByItem.get(item.id)?.severity),
            ]"
          >
            <span v-if="showFields(section) && (item.org || editable)" class="paper-org">
              <slot name="item-org" :section="section" :item="item">{{ item.org }}</slot>
            </span>
            <span v-if="showFields(section) && (item.title || editable)" class="paper-title">
              <slot name="item-title" :section="section" :item="item">{{ item.title }}</slot>
            </span>
            <span v-if="showFields(section) && (dateLabel(item) || editable)" class="paper-dates">
              <slot name="item-dates" :section="section" :item="item">{{ dateLabel(item) }}</slot>
            </span>
            <slot name="item-delete" :section="section" :item="item" />
          </div>
          <ul v-if="item.bullets.length > 0" class="paper-bullets">
            <li
              v-for="bullet in item.bullets"
              :id="`anchor-bullet-${bullet.id}`"
              :key="bullet.id"
              :class="severityClass(highlightByBullet.get(bullet.id)?.severity)"
            >
              <slot name="bullet" :section="section" :item="item" :bullet="bullet">
                <span>{{ bulletParts(bullet.text, bullet.id).before }}</span>
                <mark
                  v-if="bulletParts(bullet.text, bullet.id).mark"
                  class="paper-mark"
                  :class="severityClass(highlightByBullet.get(bullet.id)?.severity)"
                  >{{ bulletParts(bullet.text, bullet.id).mark }}</mark
                >
                <span>{{ bulletParts(bullet.text, bullet.id).after }}</span>
              </slot>
              <slot name="bullet-delete" :section="section" :item="item" :bullet="bullet" />
              <slot name="bullet-extra" :section="section" :item="item" :bullet="bullet" />
            </li>
          </ul>
          <slot name="item-add" :section="section" :item="item" />
        </div>
        <slot name="section-add" :section="section" />
      </section>
    </article>
  </div>
</template>

<style scoped>
.resume-preview {
  display: flex;
  justify-content: center;
  padding: 24px 16px 48px;
}

/* 片段：落地页样例区里的一段简历。不是整页 A4，没有最小高度，边距也收紧 */
.resume-preview.is-fragment {
  display: flex;
  justify-content: center;
  padding: 0;
}

.resume-preview.is-fragment .resume-paper {
  width: min(var(--paper-fragment-width), 100%);
  min-height: 0;
  padding: var(--space-lg) var(--space-xl);
}

.resume-paper {
  width: var(--paper-width);
  min-height: 297mm;
  padding: 14mm 15mm;
  box-sizing: border-box;
  background: var(--paper);
  color: var(--ink-900);
  box-shadow: var(--shadow-paper);
  font-family: var(--font-paper);
  font-size: 10.5pt;
  line-height: 1.55;
}

.paper-header {
  margin-bottom: 7mm;
}

.paper-name {
  margin: 0 0 2mm;
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.paper-headline {
  margin: 0 0 1mm;
  font-size: 11pt;
  color: var(--ink-700);
}

.paper-contacts {
  margin: 0;
  font-size: 9.5pt;
  color: var(--ink-500);
}

.paper-section {
  margin-bottom: 6mm;
  break-inside: auto;
}

.paper-section-title {
  margin: 0 0 2.5mm;
  padding-bottom: 1mm;
  border-bottom: 1px solid var(--ink-900);
  font-size: 12pt;
  font-weight: 700;
  break-after: avoid;
}

.paper-item {
  margin-bottom: 3.5mm;
  break-inside: avoid;
}

.paper-item-head {
  display: flex;
  align-items: baseline;
  gap: 2mm;
}

/* 编辑模式：公司与职位分掉多余宽度，时间靠右且不挤占字段 */
.paper-item-head.is-editable {
  align-items: center;
  column-gap: 3mm;
}

.paper-item-head.is-editable .paper-org,
.paper-item-head.is-editable .paper-title {
  flex: 1 1 0;
  min-width: 0;
}

.paper-item-head.is-editable .paper-org :deep(.el-input),
.paper-item-head.is-editable .paper-title :deep(.el-input) {
  width: 100%;
}

.paper-item-head.is-editable .paper-dates {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 1mm;
}

.paper-org {
  font-weight: 700;
}

.paper-title {
  color: var(--ink-700);
}

.paper-dates {
  margin-left: auto;
  font-size: 9.5pt;
  color: var(--ink-500);
  white-space: nowrap;
}

.paper-item-head.is-editable .paper-dates {
  margin-left: 4mm;
}

.paper-bullets {
  margin: 1mm 0 0;
  padding-left: 5mm;
  list-style: none;
}

.paper-bullets li {
  position: relative;
  margin-bottom: 0.8mm;
  padding-left: 4mm;
}

.paper-bullets li::before {
  content: '·';
  position: absolute;
  left: 0;
  font-weight: 700;
}

.paper-mark {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--severity-medium-soft);
  color: var(--severity-medium-ink);
}

.paper-item-head.is-marked,
.paper-section-title.is-marked {
  padding-left: 2mm;
  box-shadow: inset 3px 0 0 var(--severity-medium);
}

.paper-mark.is-high {
  background: var(--severity-high-soft);
  color: var(--severity-high-ink);
}

.paper-mark.is-medium {
  background: var(--severity-medium-soft);
  color: var(--severity-medium-ink);
}

.paper-mark.is-low {
  background: var(--severity-low-soft);
  color: var(--severity-low-ink);
}

.paper-item-head.is-marked.is-high,
.paper-section-title.is-marked.is-high {
  box-shadow: inset 3px 0 0 var(--severity-high);
}

.paper-item-head.is-marked.is-medium,
.paper-section-title.is-marked.is-medium {
  box-shadow: inset 3px 0 0 var(--severity-medium);
}

.paper-item-head.is-marked.is-low,
.paper-section-title.is-marked.is-low {
  box-shadow: inset 3px 0 0 var(--severity-low);
}
</style>

<style>
@media print {
  @page {
    size: A4;
    margin: 10mm;
  }

  html,
  body,
  #app {
    height: auto !important;
    background: var(--paper) !important;
  }

  .layout,
  .layout > .el-container {
    display: block !important;
    height: auto !important;
  }

  .layout-header,
  .layout-aside,
  .layout-banner,
  .page-header,
  .el-tabs__header {
    display: none !important;
  }

  .layout-main {
    padding: 0 !important;
    overflow: visible !important;
  }

  .page {
    max-width: none !important;
    padding: 0 !important;
  }

  .resume-preview {
    display: block !important;
    padding: 0 !important;
  }

  .resume-paper {
    width: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
  }

  /* 纸面上的行内批注是给人看的，不进打印稿 */
  .paper-comment {
    display: none !important;
  }

  /* 编辑态的视觉标记只给屏幕看 */
  .resume-editor .paper-header-body,
  .resume-editor .paper-item-head,
  .resume-editor .paper-bullets li {
    background: transparent !important;
  }

  .resume-editor .el-input__inner {
    text-decoration: none !important;
  }

  .resume-editor .resume-paper {
    outline: none !important;
  }
}
</style>
