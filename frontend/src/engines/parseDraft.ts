import type { IdSeed } from '@/domain/ids'
import { findDateSpan } from '@/domain/time'
import type { Bullet, Draft, DraftItem, DraftSection, SectionKind } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
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
 * 疑似未被识别的分区表头。
 *
 * 用户看不到「这份简历有 N 处我们没认出来」就无从判断哪里漏了。判据是一行
 * 不被识别为表头、也不含日期、长度短、后面还有内容——符合「一段没有标题的
 * 内容被并进了上一个分区」的形态。
 *
 * 阈值偏保守：宁可漏报也不误报，用户会逐渐习惯忽略误报，那这条提示就废了。
 */
export const SUSPECTED_HEADER_MAX_LENGTH = 4

function findSuspectedHeaders(lines: string[]): string[] {
  const suspected: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (headerKindOf(line) !== null) continue
    if (index === lines.length - 1) continue
    if (stripBulletMarker(line)) continue
    if (findDateSpan(line)) continue
    const normalized = normalizeHeader(line)
    if (normalized.length === 0 || normalized.length > SUSPECTED_HEADER_MAX_LENGTH) continue
    suspected.push(line)
  }
  return suspected
}

function splitOrgTitle(text: string): { org?: string; title?: string } {
  const trimmed = text.trim()
  if (!trimmed) return {}

  const separator = /\s*[|｜/／·・\-–—]\s*/
  if (separator.test(trimmed)) {
    const parts = trimmed
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean)
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
  return SECTION_ORDER.map((kind) => ({
    id: seed.next('section'),
    kind,
    title: SECTION_TITLES[kind],
    items: buckets[kind].items,
  }))
}

function parseStructured(
  lines: string[],
  seed: IdSeed,
): { buckets: Record<SectionKind, SectionBucket>; warnings: string[] } {
  const buckets: Record<SectionKind, SectionBucket> = {
    education: { items: [] },
    experience: { items: [] },
    project: { items: [] },
    skills: { items: [] },
  }
  const warnings: string[] = []

  let currentKind: SectionKind | null = null
  let currentItem: DraftItem | null = null

  for (const line of lines) {
    const kind = headerKindOf(line)
    if (kind) {
      currentKind = kind
      currentItem = null
      continue
    }
    if (!currentKind) continue

    if (currentKind === 'skills') {
      const bullet = stripBulletMarker(line)
      const text = bullet ?? line.trim()
      if (!text) continue
      let skillsItem = buckets.skills.items[0]
      if (!skillsItem) {
        skillsItem = makeItem(seed)
        buckets.skills.items.push(skillsItem)
      }
      skillsItem.bullets.push(makeBullet(text, seed))
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
    if (buckets[kind].items.length === 0) {
      warnings.push(`「${SECTION_TITLES[kind]}」分区没有识别到内容`)
    }
  }

  return { buckets, warnings }
}

function parseHeuristic(
  lines: string[],
  seed: IdSeed,
): { buckets: Record<SectionKind, SectionBucket>; warnings: string[] } {
  const buckets: Record<SectionKind, SectionBucket> = {
    education: { items: [] },
    experience: { items: [] },
    project: { items: [] },
    skills: { items: [] },
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
      suspectedHeaders: [],
      failure: { reason: 'empty', message: '需要简历正文才能解析' },
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const firstHeaderIndex = lines.findIndex((line) => headerKindOf(line) !== null)
  const hasHeader = firstHeaderIndex !== -1
  const profile = extractProfile(hasHeader ? lines.slice(0, firstHeaderIndex) : [])

  const { buckets, warnings } = hasHeader
    ? parseStructured(lines, seed)
    : parseHeuristic(lines, seed)

  if (countContent(buckets) === 0) {
    return {
      ok: false,
      draft: null,
      confidence: 0,
      warnings: [],
      suspectedHeaders: [],
      failure: { reason: 'unrecognized', message: '未能从这段文字中识别出简历结构' },
    }
  }

  const sections = buildSections(seed, buckets)
  const filled = SECTION_ORDER.filter((kind) => buckets[kind].items.length > 0).length
  const confidence = hasHeader ? (filled === SECTION_ORDER.length ? 1 : 0.9) : 0.4

  const draft: Draft = {
    id: seed.next('draft'),
    userId: '',
    revision: 1,
    profile,
    sections,
    updatedAt: '',
  }

  // 启发式路径下已经有一条「未识别到分区表头」的警告了，不用再报一遍
  const suspectedHeaders = hasHeader ? findSuspectedHeaders(lines) : []

  return { ok: true, draft, confidence, warnings, suspectedHeaders, failure: null }
}
