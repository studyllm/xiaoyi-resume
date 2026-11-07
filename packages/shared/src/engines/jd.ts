import { createIdSeed, type IdSeed } from '../domain/ids'
import type { Jd, JdRequirement, RoleNameSource } from '../domain/types'
import { matchCatalog } from './catalog'
import { findForbiddenWords } from './forbidden'
import { normalizeText } from './textUtils'
import type { EngineContext, JdParseResult } from './types'

const ROLE_WORDS = [
  '工程师',
  '架构师',
  '设计师',
  '开发',
  '经理',
  '专员',
  '分析师',
  '测试',
  '运营',
  '产品',
  '实习生',
  '主管',
  '总监',
  '顾问',
  '负责人',
]

const ROLE_LABEL_PATTERN = /^\s*(?:岗位|职位|职位名称|岗位名称|招聘岗位|角色|职位标题)\s*[：:]\s*(.+)$/
const ROLE_RECRUIT_PATTERN = new RegExp(`招聘\\s*(.+?(?:${ROLE_WORDS.join('|')}))`)
const ROLE_BLOCK_WORDS = ['岗位职责', '职位描述', '任职要求', '职位要求', '工作内容', '岗位职责描述']

const CONTENT_HEADERS = [
  '岗位职责',
  '职位职责',
  '工作职责',
  '工作内容',
  '岗位职责描述',
  '任职要求',
  '任职资格',
  '岗位要求',
  '职位要求',
  '技能要求',
  '岗位资格',
  '我们希望你能',
  '你需要',
]

const BOILERPLATE_HEADERS = [
  '公司简介',
  '公司介绍',
  '关于我们',
  '福利待遇',
  '福利',
  '薪资待遇',
  '薪资',
  '薪酬',
  '工作地点',
  '上班地址',
  '联系方式',
  '团队介绍',
  '公司文化',
  '投递方式',
  '简历发送',
  '公司简介与福利',
]

const REQUIREMENT_MARKERS = [
  '要求',
  '熟悉',
  '精通',
  '掌握',
  '具备',
  '了解',
  '优先',
  '经验',
  '能力',
  '学历',
  '本科',
  '期望',
]

const STOP_WORDS = [
  '熟悉',
  '精通',
  '掌握',
  '具备',
  '了解',
  '要求',
  '优先',
  '以上',
  '相关',
  '经验',
  '能力',
  '具有',
  '能够',
  '会',
  '有',
  '的',
  '与',
  '和',
  '及',
  '或',
  '在',
  '对',
  '等',
  '以及',
  '工作',
  '使用',
  '完成',
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'for',
  'with',
  'to',
  'in',
  'on',
  'is',
  'are',
  'work',
  'experience',
  'ability',
  'skill',
  'skills',
  'team',
  'good',
  'strong',
  'plus',
]

function normalizeHeader(line: string): string {
  return line.replace(/[\s：:，,。.、]/g, '')
}

function headerOf(line: string): { kind: 'content' | 'boilerplate'; text: string } | null {
  const normalized = normalizeHeader(line)
  for (const header of BOILERPLATE_HEADERS) {
    if (normalized === header || normalized.startsWith(header)) {
      return { kind: 'boilerplate', text: header }
    }
  }
  for (const header of CONTENT_HEADERS) {
    if (normalized === header || normalized.startsWith(header)) {
      return { kind: 'content', text: header }
    }
  }
  return null
}

function splitSentences(line: string): string[] {
  return line
    .split(/[。！？；]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

function looksLikeRequirement(line: string): boolean {
  if (/^\s*(?:\d+[.、)]|[·•‧▪●*\-])\s*/.test(line)) return true
  return REQUIREMENT_MARKERS.some((marker) => line.includes(marker))
}

export function extractCorePhrases(text: string): string[] {
  let working = text

  for (const word of STOP_WORDS) {
    if (/^[a-z]/i.test(word)) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      working = working.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ')
    } else {
      working = working.split(word).join(' ')
    }
  }

  const phrases: string[] = []
  for (const match of working.matchAll(/[一-鿿]+|[A-Za-z][A-Za-z0-9+#.]*/g)) {
    const phrase = match[0].replace(/[.,;:!?]+$/, '')
    if (phrase.length >= 2) phrases.push(phrase)
  }

  return [...new Set(phrases)].sort((left, right) => right.length - left.length).slice(0, 2)
}

function detectRoleName(
  lines: string[],
  fallbackIndex: number,
): { name: string; source: RoleNameSource } {
  for (const line of lines) {
    const matched = ROLE_LABEL_PATTERN.exec(line.trim())
    if (matched) {
      const name = matched[1]!.trim()
      if (name) return { name, source: 'explicit' }
    }
  }

  for (const line of lines) {
    const matched = ROLE_RECRUIT_PATTERN.exec(line)
    if (matched) {
      const name = matched[1]!.trim()
      if (name) return { name, source: 'pattern' }
    }
  }

  const firstMeaningful = lines.find((line) => line.trim().length > 0)
  if (firstMeaningful) {
    const trimmed = firstMeaningful.trim()
    const blocked = ROLE_BLOCK_WORDS.some((word) => trimmed.includes(word))
    const hasRole = ROLE_WORDS.some((word) => trimmed.includes(word))
    if (!blocked && hasRole && trimmed.length <= 24) {
      return { name: trimmed, source: 'first-line' }
    }
  }

  for (const line of lines.slice(0, 3)) {
    const trimmed = line.trim()
    const blocked = ROLE_BLOCK_WORDS.some((word) => trimmed.includes(word))
    const hasRole = ROLE_WORDS.some((word) => trimmed.includes(word))
    if (!blocked && hasRole && trimmed.length <= 24) {
      return { name: trimmed, source: 'phrase' }
    }
  }

  return { name: `版本 ${fallbackIndex}`, source: 'fallback' }
}

function keywordsOf(text: string): string[] {
  const exact = matchCatalog(text)
    .filter((match) => match.kind === 'alias')
    .map((match) => match.term)
  return [...new Set(exact)]
}

export function parseJd(
  jdText: string,
  _ctx: EngineContext,
  seed: IdSeed = createIdSeed(),
  existingVersionCount = 0,
): JdParseResult {
  const warnings: string[] = []
  const lines = jdText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      jd: {
        id: seed.next('jd'),
        rawText: jdText,
        roleName: `版本 ${existingVersionCount + 1}`,
        roleNameSource: 'fallback',
        requirements: [],
      },
      warnings: ['JD 内容为空，没有可提取的要求'],
    }
  }

  const role = detectRoleName(lines, existingVersionCount + 1)
  const roleLineIndex = lines.findIndex(
    (line) => line.trim() === role.name || ROLE_LABEL_PATTERN.test(line.trim()),
  )

  const candidates: string[] = []
  let inContentSection = false
  let inBoilerplate = false

  for (const [index, line] of lines.entries()) {
    const header = headerOf(line)
    if (header) {
      inContentSection = header.kind === 'content'
      inBoilerplate = header.kind === 'boilerplate'
      continue
    }
    if (inBoilerplate) continue
    if (index === roleLineIndex) continue
    if (!inContentSection && !looksLikeRequirement(line)) continue

    for (const sentence of splitSentences(line)) {
      const text = sentence.replace(/^\s*(?:\d+[.、)]|[·•‧▪●*\-])\s*/, '').trim()
      if (text.length < 6) continue
      candidates.push(text)
    }
  }

  const requirements: JdRequirement[] = []
  const seen = new Map<string, JdRequirement>()

  for (const text of candidates) {
    if (findForbiddenWords(text).length > 0) continue

    const key = normalizeText(text)
    const existing = seen.get(key)
    if (existing) {
      for (const keyword of keywordsOf(text)) {
        if (!existing.keywords.includes(keyword)) existing.keywords.push(keyword)
      }
      continue
    }

    const keywords = keywordsOf(text)
    const requirement: JdRequirement = { id: seed.next('req'), text, keywords }
    seen.set(key, requirement)
    requirements.push(requirement)
  }

  if (requirements.length === 0) {
    warnings.push('未能从 JD 中提取到明确的要求条目')
  }

  const jd: Jd = {
    id: seed.next('jd'),
    rawText: jdText,
    roleName: role.name,
    roleNameSource: role.source,
    requirements,
  }

  return { jd, warnings }
}
