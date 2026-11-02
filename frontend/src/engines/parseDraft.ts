import type { IdSeed } from '@/domain/ids'
import { findDateSpan } from '@/domain/time'
import type { Bullet, Draft, DraftItem, DraftSection, SectionKind } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
import { matchCatalog } from './catalog'
import { extractProfile } from './profile'
import type { EngineContext, ParseResult } from './types'

export const LOW_CONFIDENCE_THRESHOLD = 0.6

const HEADER_KEYWORDS: Array<{ kind: SectionKind; keywords: string[] }> = [
  { kind: 'education', keywords: ['教育背景', '教育经历', '教育情况', '学习经历', '学历背景', '教育'] },
  {
    kind: 'experience',
    keywords: ['工作经历', '工作经验', '工作履历', '职业经历', '实习经历', '任职经历', '工作'],
  },
  { kind: 'project', keywords: ['项目经历', '项目经验', '项目实践', '主要项目', '项目'] },
  { kind: 'skills', keywords: ['专业技能', '技术技能', '技能特长', '个人技能', '技术栈', '技能'] },
]

const BULLET_MARKERS = ['·', '•', '‧', '▪', '●', '⁃', '*', '-']
const CJK_PATTERN = /[一-鿿]/

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
  const colonIndex = line.search(/[：:]/)
  if (colonIndex > 0) {
    const head = line.slice(0, colonIndex).trim()
    for (const { kind, keywords } of HEADER_KEYWORDS) {
      if (keywords.includes(head)) return kind
    }
  }

  const normalized = line.replace(/[\s：:，,。.、]/g, '')
  if (normalized.length > 12) return null

  for (const { kind, keywords } of HEADER_KEYWORDS) {
    for (const keyword of keywords) {
      if (normalized.startsWith(keyword)) return kind
    }
  }
  return null
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

  return { ok: true, draft, confidence, warnings, failure: null }
}
