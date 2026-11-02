import { createIdSeed } from '@/domain/ids'
import type { DraftSection } from '@/domain/types'
import { parseDraft } from '@/engines/parseDraft'
import { SAMPLE_DRAFT_TEXT } from './fixtures'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'mock-0.1.0' }

export interface ShowcaseComment {
  anchor: string
  severity: 'high' | 'medium' | 'low'
  problem: string
  suggestion: string
}

const parsed = parseDraft(SAMPLE_DRAFT_TEXT, CTX, createIdSeed())

const allSections: DraftSection[] = parsed.draft?.sections ?? []

/**
 * 落地页样例展示一段简历：教育背景 + 工作经历里的第一条经历。
 * 整页 A4 缩到首屏宽度后正文只剩 9px 左右，读不清；片段用真实字号展示。
 * 带上教育背景是为了让纸的高度和右侧的批注栏齐平，两根柱子一样高才不显得散。
 */
export const SHOWCASE_FRAGMENT_SECTIONS: DraftSection[] = (() => {
  const education = allSections.find((section) => section.kind === 'education')
  const experience = allSections.find((section) => section.kind === 'experience')
  const first = experience?.items[0]
  if (!education || !experience || !first) return []
  return [education, { ...experience, items: [first] }]
})()

/** 首屏展示用的三条批注，对应样例简历里最典型的问题。 */
export const SHOWCASE_COMMENTS: ShowcaseComment[] = [
  {
    anchor: '负责公司营销活动页面的前端开发，配合设计团队完成活动上线',
    severity: 'medium',
    problem: '这句只写了承担了什么，没有写出做到什么程度，读者无法判断结果。',
    suggestion: '补上一个可衡量的结果。',
  },
  {
    anchor: '团队协作良好，认真负责，积极向上',
    severity: 'medium',
    problem: '这句用的是笼统评价，没有具体技术名词，也没有可衡量的结果。',
    suggestion: '换成具体的技术名词和结果。',
  },
  {
    anchor: '日常维护团队组件库',
    severity: 'low',
    problem: '「日常维护」说明不了维护的是什么、覆盖了多少调用方。',
    suggestion: '写清楚维护的是什么、覆盖了多少调用方。',
  },
]

