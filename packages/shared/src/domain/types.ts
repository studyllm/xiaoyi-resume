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

/** 声明级判定的不通过类型。界面按它分组展示（「有 2 处新增了数字」）。 */
export type IntegrityIssueKind =
  | 'unsupported-measure'
  | 'unsupported-entity'
  | 'rating-up'
  | 'verb-strength-up'
  | 'unsupported-term'
  | 'unreferenced'
  | 'keep-mismatch'
  | 'delete-mismatch'

// ---------------------------------------------------------------- 事实账本与声明账本
//
// ADR-0003 §7：这两个类型放 domain 层——账本不是某个引擎的实现细节，
// 规则引擎与模型生成器都要产出它们。

export type ComponentKind = 'measure' | 'entity' | 'rating' | 'verb' | 'term'

export interface FactComponent {
  kind: ComponentKind
  text: string
  /** 只对 kind 是 'verb' 与 'rating'：强度序上的位次，越大越强。 */
  strength?: number
}

export interface Fact {
  /** 内容的哈希。同一份底稿两次抽出的 fact 集合全等，跨版本也能对照。 */
  factId: string
  /** 子句原文 */
  text: string
  /** 在底稿要点正文里的字符区间 */
  span: { start: number; end: number }
  components: FactComponent[]
}

export type ClaimOperation = 'keep' | 'rewrite' | 'merge' | 'delete'

export interface Claim {
  claimId: string
  /** 这条断言属于哪个输出要点——回退的粒度是要点。 */
  bulletId: string
  text: string
  span: { start: number; end: number }
  /** 依据了哪些 fact */
  sourceFactIds: string[]
  operation: ClaimOperation
  /** 生成器的自评置信度（0–1）。**不参与判定**——自评若参与判定，就是模型自己说自己可信。 */
  confidence: number
}

export interface ClaimIssue {
  kind: IntegrityIssueKind
  /** 哪个成分没被支撑 */
  component?: string
  detail: string
}

export type ClaimObservationKind = 'assembled-from-facts' | 'verb-strength-down'

export interface ClaimObservation {
  kind: ClaimObservationKind
  detail: string
}

export interface ClaimVerdict {
  claimId: string
  bulletId: string
  trusted: boolean
  issues: ClaimIssue[]
  /** 只记录、不拦截的观察项。 */
  observations: ClaimObservation[]
}

/** 版本自带的审计线索。一份版本要能被独立审计，不能要求再 join 别的表。 */
export interface VersionTrace {
  facts: Fact[]
  claims: Claim[]
}

export interface IntegrityViolation {
  bulletId: string
  /** 哪一条声明没过。 */
  claimId?: string
  /** 结构化的不通过类型。 */
  kind?: IntegrityIssueKind
  /** 哪个成分没被支撑。 */
  component?: string
  reason: string
  originalText: string
  revertedText: string
}

/** 只记录、不拦截的观察项（如中文实词变更、职责降级）。 */
export interface IntegrityObservation {
  bulletId?: string
  kind: string
  detail: string
}

export interface IntegrityReport {
  /** 校验了多少条声明 */
  checked: number
  violations: IntegrityViolation[]
  /** 这一版正文是谁写的 */
  generator: 'rules' | 'llm'
  /** 有多少条输出要点回退到了规则引擎的产出 */
  reverted: number
  /** 这次生成没有完全由模型产出：模型不可用，或有要点被回退 */
  degraded: boolean
  /** 只记录、不拦截的观察项 */
  observations: IntegrityObservation[]
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
  /** 版本自带的审计线索。模型生成的版本带，规则生成的版本不带。 */
  trace?: VersionTrace | null
  engineVersion: string
}

export interface User {
  id: string
  /** 邮箱。服务端签发的账号标识不含邮箱的任何片段（ADR-0002 §5）。 */
  email: string
}

export interface Session {
  token: string
  user: User
  createdAt: string
}
