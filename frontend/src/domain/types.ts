import type { YearMonth } from './time'

export type SectionKind = 'education' | 'experience' | 'project' | 'skills' | 'other'

export const SECTION_ORDER: SectionKind[] = ['education', 'experience', 'project', 'skills', 'other']

/**
 * 必须填齐的分区。解析置信度只看这几个——「其它」是可选的，填不满不算问题。
 */
export const REQUIRED_SECTION_KINDS: SectionKind[] = ['education', 'experience', 'project', 'skills']

/**
 * 这些分区在结构上没有条目头——它们整个分区就是一行行内容。
 * 专业技能是技能行，「其它」是自我评价、获奖经历这类内容。
 */
export const SECTIONS_WITHOUT_ITEM_HEAD: SectionKind[] = ['skills', 'other']

export function hasItemHead(kind: SectionKind): boolean {
  return !SECTIONS_WITHOUT_ITEM_HEAD.includes(kind)
}

export const SECTION_TITLES: Record<SectionKind, string> = {
  education: '教育背景',
  experience: '工作经历',
  project: '项目经历',
  skills: '专业技能',
  other: '其它',
}

export interface Bullet {
  id: string
  text: string
}

export interface DraftItem {
  id: string
  org?: string
  title?: string
  start?: YearMonth | null
  end?: YearMonth | null
  present?: boolean
  bullets: Bullet[]
}

export interface DraftSection {
  id: string
  kind: SectionKind
  title: string
  items: DraftItem[]
}

export interface DraftContact {
  label: string
  value: string
}

export interface DraftProfile {
  name: string
  headline: string
  contacts: DraftContact[]
}

export const EMPTY_PROFILE: DraftProfile = { name: '', headline: '', contacts: [] }

export interface Draft {
  /** 用户持续维护的唯一事实源，界面上显示为「我的简历」 */
  id: string
  userId: string
  revision: number
  profile: DraftProfile
  sections: DraftSection[]
  updatedAt: string
}

export type DiagnosisCategory = 'responsibility-no-result' | 'vague' | 'structure'

export type Severity = 'high' | 'medium' | 'low'

export const CATEGORY_LABELS: Record<DiagnosisCategory, string> = {
  'responsibility-no-result': '只有职责没有结果',
  vague: '表述空泛',
  structure: '时间线或结构不顺',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export interface DiagnosisIssue {
  id: string
  ruleId: string
  category: DiagnosisCategory
  severity: Severity
  sectionId: string
  sectionKind: SectionKind
  sectionTitle: string
  itemId: string
  itemLabel: string
  bulletId: string
  quote: string
  highlight: string
  problem: string
  suggestion: string
}

export interface Diagnosis {
  draftId: string
  draftRevision: number
  /** 诊断发起时的内容变更计数，用来判断诊断是否已过期 */
  contentVersion: number
  issues: DiagnosisIssue[]
  createdAt: string
}

/** 诊断的三种状态：还没诊断过、诊断过但没有意见、有意见。 */
export type DiagnosisState = 'none' | 'empty' | 'result'

export type RoleNameSource = 'explicit' | 'pattern' | 'first-line' | 'phrase' | 'fallback'

export interface JdRequirement {
  id: string
  text: string
  keywords: string[]
}

export interface Jd {
  id: string
  rawText: string
  roleName: string
  roleNameSource: RoleNameSource
  requirements: JdRequirement[]
}

export type DiffChange = 'keep' | 'rewrite' | 'remove'
export type DiffPlacement = 'same' | 'reorder' | 'to-end'

export interface DiffEntry {
  bulletId: string
  sectionId: string
  sectionKind: SectionKind
  sectionTitle: string
  itemId: string
  itemLabel: string
  change: DiffChange
  placement: DiffPlacement
  fromText: string | null
  toText: string | null
  toIndex: number | null
  reason: string
}

export type UncoveredReason = 'no-match' | 'planned-only'

export type CoverageTier = 'strong' | 'weak' | 'none'

export interface RequirementCoverage {
  requirementId: string
  text: string
  keywords: string[]
  tier: CoverageTier
  approximate: boolean
  reason: UncoveredReason | null
  matchedBulletIds: string[]
}

export interface UncoveredRequirement {
  requirementId: string
  text: string
  keywords: string[]
  reason: UncoveredReason
  explanation: string
}

export interface IntegrityViolation {
  bulletId: string
  reason: string
  originalText: string
  revertedText: string
}

export interface IntegrityReport {
  checked: number
  violations: IntegrityViolation[]
}

export interface VersionBullet {
  id: string
  text: string
}

export interface VersionItem {
  id: string
  org?: string
  title?: string
  start?: YearMonth | null
  end?: YearMonth | null
  present?: boolean
  bullets: VersionBullet[]
}

export interface VersionSection {
  kind: SectionKind
  title: string
  items: VersionItem[]
}

export interface ResumeVersion {
  id: string
  userId: string
  name: string
  /** 生成时刻的简历抬头，之后改底稿不回写 */
  profile: DraftProfile
  jdRawText: string
  jdRoleName: string
  draftRevision: number
  createdAt: string
  body: string
  sections: VersionSection[]
  diff: DiffEntry[]
  uncovered: UncoveredRequirement[]
  coverage: RequirementCoverage[]
  integrity: IntegrityReport
  engineVersion: string
}

export interface User {
  id: string
  username: string
}

export interface Session {
  token: string
  user: User
  createdAt: string
}
