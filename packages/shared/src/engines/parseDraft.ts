import type { IdSeed } from '../domain/ids'
import { FAILURE_STATES } from '../domain/states'
import { compareYearMonth, findDateSpan } from '../domain/time'
import type { Bullet, Draft, DraftItem, DraftSection, SectionKind } from '../domain/types'
import {
  REQUIRED_SECTION_KINDS,
  SECTION_ORDER,
  SECTION_TITLES,
  hasItemHead,
} from '../domain/types'
import { matchCatalog } from './catalog'
import { extractProfile } from './profile'
import type { EngineContext, ParseResult } from './types'

export const LOW_CONFIDENCE_THRESHOLD = 0.6

/**
 * 分区表头关键词。
 *
 * 顺序有意义：**长词必须排在短词前面**（「工作经历」在「工作」之前）。匹配取第一个
 * 命中的，短词先命中会把「工作经历与项目经历」这类复合表头截断。
 */
export const HEADER_KEYWORDS: Array<{ kind: SectionKind; keywords: string[] }> = [
  {
    kind: 'education',
    keywords: [
      '教育与培训', '教育背景', '教育经历', '教育情况', '学习经历', '学历背景', '教育',
      'Educational Background', 'Educational Experience', 'Academic Background', 'Education',
    ],
  },
  {
    kind: 'experience',
    keywords: [
      '工作经历', '工作经验', '工作履历', '职业经历', '实习经历', '任职经历', '工作背景', '工作',
      'Professional Experience', 'Working Experience', 'Work Experience', 'Employment History',
      'Career History', 'Work History', 'Experience',
    ],
  },
  {
    kind: 'project',
    keywords: [
      '项目经历', '项目经验', '项目实践', '主要项目', '代表性项目', '项目',
      'Project Experience', 'Selected Projects', 'Key Projects', 'Projects', 'Project',
    ],
  },
  {
    kind: 'skills',
    keywords: [
      '专业技能', '技术技能', '核心技能', '技能特长', '个人技能', '技术栈', 'IT技能',
      '核心优势', '个人能力', '专业能力', '擅长技能', '技能',
      'Technical Skills', 'Core Competencies', 'Skill Highlights', 'Technical Stack',
      'Qualifications', 'Core Skills', 'Skills',
    ],
  },
  {
    kind: 'other',
    keywords: [
      '自我评价', '获奖经历', '荣誉奖项', '荣誉', '证书', '语言能力', '社团经历',
      '志愿服务', '个人评价', '实习项目', '校园经历', '专业认证', '培训经历',
      '获奖情况', '所获荣誉', '个人特长', '兴趣爱好',
      'Personal Summary', 'Self Evaluation', 'Awards', 'Certificates', 'Profile',
      'Publications', 'Volunteer Experience', 'Interests', 'Activities',
    ],
  },
]

/** 复合表头里出现的连接词，如「工作经历与项目经历」。 */
const CONNECTOR_PATTERN = /^[与和、及／/]/

/** 标题里的中文，用于判断表头后面接的是不是中文描述。 */
const CJK_PATTERN = /[一-鿿]/

/**
 * 表头归一化：去掉空格与常见标点。
 * 关键词与待匹配文本两侧同样处理，「Work Experience」与「WorkExperience」才等值。
 */
function normalizeHeader(text: string): string {
  return text.replace(/[\s：:，,。.、]/g, '')
}

/**
 * 剥掉行首的序号与装饰符号。
 *
 * 序号里的数字限 1–3 位——否则「2021.03」这样的日期行会被剥掉前缀。
 */
function stripDecoration(line: string): string {
  let text = line.trim()
  text = text.replace(/^[【\[（(《〈]\s*/, '').replace(/\s*[】\]）)》〉]$/, '')
  text = text.replace(/^(?:[一二三四五六七八九十百]{1,3}|\d{1,3})\s*[、.．,，)）:：]\s*/, '')
  text = text.replace(/^\d{1,3}\s*/, '')
  text = text.replace(/^[◆■●○★☆※·\-—–_]+\s*/, '')
  return text.trim()
}

/**
 * 判断一段文字是不是某个分区的表头。
 *
 * 关键词后面只能接三种东西：什么都没有、复合表头的连接词、或者不含中文的补充说明
 * （英文副标题）。**关键词后面紧跟中文描述时不算表头**——否则「工作负责得很全面」
 * 这类要点会被当成分区表头，整行内容从此消失。
 */
function kindOfHeaderText(text: string): SectionKind | null {
  const normalized = normalizeHeader(text)
  if (!normalized) return null

  for (const { kind, keywords } of HEADER_KEYWORDS) {
    for (const keyword of keywords) {
      const key = normalizeHeader(keyword)
      if (!key) continue
      if (normalized === key) return kind
      if (!normalized.startsWith(key)) continue
      const rest = normalized.slice(key.length)
      if (rest === '' || CONNECTOR_PATTERN.test(rest) || !CJK_PATTERN.test(rest)) return kind
    }
  }
  return null
}

const BULLET_MARKERS = ['·', '•', '‧', '▪', '●', '⁃', '*', '-']

interface SectionBucket {
  items: DraftItem[]
}

function stripBulletMarker(line: string): string | null {
  for (const marker of BULLET_MARKERS) {
    if (!line.startsWith(marker)) continue
    const rest = line.slice(marker.length).trim()
    if (!rest) continue
    if (marker === '-' || marker === '*') {
      const next = line[marker.length]
      if (next && !/\s/.test(next) && !CJK_PATTERN.test(next)) continue
    }
    return rest
  }
  return null
}

function headerKindOf(line: string): SectionKind | null {
  const cleaned = stripDecoration(line)

  // 冒号路径：冒号前的部分
  const colonIndex = cleaned.search(/[：:]/)
  if (colonIndex > 0) {
    const kind = kindOfHeaderText(cleaned.slice(0, colonIndex).trim())
    if (kind) return kind
  }

  // 整行：中文部分优先（中英混排时按中文认），没有中文时整行算
  const cjk = cleaned.match(/^[一-鿿][一-鿿\s]*/)
  const part = cjk ? cjk[0].trim() : cleaned.trim()
  return kindOfHeaderText(part)
}

/**
 * 机构形态词。
 *
 * 出现这些词的片段是机构名，不是职位。机构名千奇百怪，形态词却很稳定：
 * 「XX科技有限公司」「XX信息技术股份有限公司」「XX理工大学」。
 *
 * 靠它把机构名从职位里挑出来——条目头常写成「项目经理 / Java高级开发 |
 * 南京XXX信息科技有限公司」，按分隔符切只能切出「项目经理」当机构名。
 */
const ORG_PATTERN =
  /有限|集团|科技|信息|股份|实业|网络|软件|数据|研究院|研究所|事业部|中心|公司|银行|保险|证券|医院|大学|学院|学校/

function splitOrgTitle(text: string): { org?: string; title?: string } {
  const trimmed = text.trim()
  if (!trimmed) return {}

  const separator = /\s*[|｜/／·・\-–—]\s*/
  if (separator.test(trimmed)) {
    const parts = trimmed
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean)
    // 有形态词的那个片段是机构名，其余是职位
    const orgPart = parts.find((part) => ORG_PATTERN.test(part))
    if (orgPart) {
      const rest = parts.filter((part) => part !== orgPart)
      return { org: orgPart, ...(rest.length ? { title: rest.join(' ') } : {}) }
    }
    if (parts.length >= 2) return { org: parts[0], title: parts.slice(1).join(' ') }
    if (parts.length === 1) return { org: parts[0] }
  }

  const bySpace = trimmed.split(/\s+/).filter(Boolean)
  if (bySpace.length >= 2) return { org: bySpace[0], title: bySpace.slice(1).join(' ') }
  return { org: trimmed }
}

function isMeaningfulLine(line: string): boolean {
  const cjkCount = (line.match(/[一-鿿]/g) ?? []).length
  if (cjkCount >= 2) return true
  return matchCatalog(line).length > 0
}

function makeBullet(text: string, seed: IdSeed): Bullet {
  return { id: seed.next('bullet'), text }
}

function makeItem(seed: IdSeed, fields: Partial<DraftItem> = {}): DraftItem {
  return { id: seed.next('item'), bullets: [], ...fields }
}

function buildSections(
  seed: IdSeed,
  buckets: Record<SectionKind, SectionBucket>,
): DraftSection[] {
  return SECTION_ORDER.filter((kind) => kind !== 'other' || buckets[kind].items.length > 0).map(
    (kind) => ({
      id: seed.next('section'),
      kind,
      title: SECTION_TITLES[kind],
      items: sortByRecency(buckets[kind].items, kind),
    }),
  )
}

/**
 * 条目按开始时间倒序排——简历本来就该最近的一段在最前面。
 *
 * 解析器保留原文顺序，但结构检查要求倒序：一边不排一边报「没有按时间倒序」，
 * 用户只能自己动手改。**能自动修的就别报错**——这里排完，那类问题就不存在了。
 *
 * 没有开始时间的条目排在后面，彼此保持原文顺序。`Array.sort` 是稳定的，
 * 所以开始时间相同的条目也保持原文顺序。
 */
function sortByRecency(items: DraftItem[], kind: SectionKind): DraftItem[] {
  // 专业技能与「其它」在结构上没有条目头，整个分区就是内容，不排序
  if (!hasItemHead(kind)) return items
  return [...items].sort((left, right) => {
    if (!left.start && !right.start) return 0
    if (!left.start) return 1
    if (!right.start) return -1
    return compareYearMonth(right.start, left.start)
  })
}

function parseStructured(
  lines: string[],
  seed: IdSeed,
): { buckets: Record<SectionKind, SectionBucket>; warnings: string[]; otherHeaders: string[] } {
  const buckets: Record<SectionKind, SectionBucket> = {
    education: { items: [] },
    experience: { items: [] },
    project: { items: [] },
    skills: { items: [] },
    other: { items: [] },
  }
  const warnings: string[] = []
  /** 引导「其它」分区的那些表头——用户要知道哪几段被放进了「其它」。 */
  const otherHeaders: string[] = []

  let currentKind: SectionKind | null = null
  let currentItem: DraftItem | null = null

  for (const line of lines) {
    const kind = headerKindOf(line)
    if (kind) {
      currentKind = kind
      currentItem = null
      if (kind === 'other') otherHeaders.push(line)
      continue
    }
    if (!currentKind) continue

    // 专业技能与「其它」在结构上没有条目头，整个分区就是一行行内容
    if (currentKind === 'skills' || currentKind === 'other') {
      const bullet = stripBulletMarker(line)
      const text = bullet ?? line.trim()
      if (!text) continue
      let flatItem = buckets[currentKind].items[0]
      if (!flatItem) {
        flatItem = makeItem(seed)
        buckets[currentKind].items.push(flatItem)
      }
      flatItem.bullets.push(makeBullet(text, seed))
      continue
    }

    const bullet = stripBulletMarker(line)
    if (bullet) {
      if (!currentItem) {
        currentItem = makeItem(seed)
        buckets[currentKind].items.push(currentItem)
      }
      currentItem.bullets.push(makeBullet(bullet, seed))
      continue
    }

    const span = findDateSpan(line)
    if (span) {
      const remainder = `${line.slice(0, span.start)} ${line.slice(span.end)}`

      // PDF 的行宽会把条目头切成两半：
      //   「Java开发工程师 | 南京XX数据系统股份有限公司 | 2013/03 –」
      //   「2017/09」
      // 后半行只有日期，没有别的字——那是上一条的**结束日期**，不是新的一条。
      // 当成新条目会多出一条没名没姓的条目，还会打乱顺序。
      //
      // 但表格里的行序不按时间走（那是表格，不是经历）：补上的日期比开始还早时
      // 不合并——那说明它是下一行自己的日期。
      const previous = currentItem
      const previousStart = previous?.start ?? ''
      const spanStart = span.range.start ?? ''
      if (
        !remainder.trim() &&
        previous &&
        previousStart &&
        !previous.end &&
        !previous.present &&
        compareYearMonth(spanStart, previousStart) >= 0
      ) {
        previous.end = spanStart
        previous.present = span.range.present
        continue
      }

      const { org, title } = splitOrgTitle(remainder)
      currentItem = makeItem(seed, {
        org,
        title,
        start: span.range.start,
        end: span.range.end,
        present: span.range.present,
      })
      buckets[currentKind].items.push(currentItem)
      continue
    }

    if (!currentItem) {
      currentItem = makeItem(seed)
      buckets[currentKind].items.push(currentItem)
    }
    currentItem.bullets.push(makeBullet(line.trim(), seed))
  }

  for (const kind of SECTION_ORDER) {
    // 「其它」是可选的，空着不算问题
    if (kind === 'other') continue
    if (buckets[kind].items.length === 0) {
      warnings.push(`「${SECTION_TITLES[kind]}」分区没有识别到内容`)
    }
  }

  return { buckets, warnings, otherHeaders }
}

function parseHeuristic(
  lines: string[],
  seed: IdSeed,
): { buckets: Record<SectionKind, SectionBucket>; warnings: string[]; otherHeaders: string[] } {
  const buckets: Record<SectionKind, SectionBucket> = {
    education: { items: [] },
    experience: { items: [] },
    project: { items: [] },
    skills: { items: [] },
    other: { items: [] },
  }

  let currentItem: DraftItem | null = null
  let currentBucket: SectionKind = 'experience'

  for (const line of lines) {
    const bullet = stripBulletMarker(line)
    if (bullet) {
      if (!currentItem) {
        currentItem = makeItem(seed)
        buckets[currentBucket].items.push(currentItem)
      }
      currentItem.bullets.push(makeBullet(bullet, seed))
      continue
    }

    const span = findDateSpan(line)
    if (span) {
      const remainder = `${line.slice(0, span.start)} ${line.slice(span.end)}`
      const { org, title } = splitOrgTitle(remainder)
      currentItem = makeItem(seed, {
        org,
        title,
        start: span.range.start,
        end: span.range.end,
        present: span.range.present,
      })
      currentBucket = 'experience'
      buckets.experience.items.push(currentItem)
      continue
    }

    if (!isMeaningfulLine(line)) continue

    if (!currentItem) {
      const isShort = line.trim().length <= 8 && !line.includes('：') && !line.includes(':')
      if (isShort) {
        currentItem = makeItem(seed, { org: line.trim() })
        currentBucket = 'experience'
        buckets.experience.items.push(currentItem)
      } else {
        currentItem = makeItem(seed)
        currentBucket = 'skills'
        buckets.skills.items.push(currentItem)
        currentItem.bullets.push(makeBullet(line.trim(), seed))
      }
      continue
    }

    currentItem.bullets.push(makeBullet(line.trim(), seed))
  }

  return {
    buckets,
    warnings: ['未识别到分区表头，已按启发式推断分区，建议在保存前确认结构'],
    otherHeaders: [],
  }
}

function countContent(buckets: Record<SectionKind, SectionBucket>): number {
  return SECTION_ORDER.reduce((total, kind) => {
    for (const item of buckets[kind].items) {
      total += item.bullets.length
      if (item.org) total += 1
    }
    return total
  }, 0)
}

export function parseDraft(rawText: string, _ctx: EngineContext, seed: IdSeed): ParseResult {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return {
      ok: false,
      draft: null,
      confidence: 0,
      warnings: [],
      otherHeaders: [],
      failure: { reason: 'empty', state: FAILURE_STATES['parse-empty'] },
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const firstHeaderIndex = lines.findIndex((line) => headerKindOf(line) !== null)
  const hasHeader = firstHeaderIndex !== -1
  const profile = extractProfile(hasHeader ? lines.slice(0, firstHeaderIndex) : [])

  const { buckets, warnings, otherHeaders } = hasHeader
    ? parseStructured(lines, seed)
    : { ...parseHeuristic(lines, seed), otherHeaders: [] }

  if (countContent(buckets) === 0) {
    return {
      ok: false,
      draft: null,
      confidence: 0,
      warnings: [],
      otherHeaders: [],
      failure: { reason: 'unrecognized', state: FAILURE_STATES['parse-failed'] },
    }
  }

  const sections = buildSections(seed, buckets)
  // 置信度只看必填分区——「其它」填不满不算问题
  const filled = REQUIRED_SECTION_KINDS.filter((kind) => buckets[kind].items.length > 0).length
  const confidence = hasHeader ? (filled === REQUIRED_SECTION_KINDS.length ? 1 : 0.9) : 0.4

  const draft: Draft = {
    id: seed.next('draft'),
    userId: '',
    revision: 1,
    profile,
    sections,
    updatedAt: '',
  }

  return { ok: true, draft, confidence, warnings, otherHeaders, failure: null }
}
