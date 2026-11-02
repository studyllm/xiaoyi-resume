import { matchCatalog } from './catalog'

export const RESPONSIBILITY_VERBS = [
  '负责',
  '参与',
  '协助',
  '跟进',
  '完成',
  '开发',
  '实现',
  '承担',
]

export const VAGUE_PHRASES = [
  '团队协作',
  '团队合作',
  '认真负责',
  '积极向上',
  '工作积极',
  '日常维护',
  '业务需求',
  '沟通良好',
  '责任心强',
  '吃苦耐劳',
  '踏实肯干',
  '配合度好',
  '认真细致',
]

const MAGNITUDE_WORDS = [
  '提升',
  '提高',
  '降低',
  '下降',
  '减少',
  '缩短',
  '节省',
  '加速',
  '增长',
  '翻倍',
  '优化',
  '百万',
  '千万',
  '亿级',
  '万级',
]

const COMPARISON_PATTERN = /从[^，。；]{1,20}(?:到|降|提升|提高|缩短|减少|增长|上升|下降)/

const GENERIC_LATIN = new Set(['and', 'the', 'with', 'for', 'etc', 'good', 'well'])

export function findVaguePhrases(text: string): string[] {
  return VAGUE_PHRASES.filter((phrase) => text.includes(phrase))
}

export interface PhraseSpan {
  phrase: string
  start: number
  end: number
}

export function findPhraseSpans(text: string, phrases: string[]): PhraseSpan[] {
  const spans: PhraseSpan[] = []
  for (const phrase of phrases) {
    let cursor = text.indexOf(phrase)
    while (cursor !== -1) {
      spans.push({ phrase, start: cursor, end: cursor + phrase.length })
      cursor = text.indexOf(phrase, cursor + 1)
    }
  }
  return spans.sort((left, right) => left.start - right.start)
}

function overlapsSpan(spans: PhraseSpan[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start)
}

export interface ResponsibilityHit {
  verb: string
  start: number
  end: number
}

export function findResponsibilityHits(text: string): ResponsibilityHit[] {
  const vagueSpans = findPhraseSpans(text, VAGUE_PHRASES)
  const hits: ResponsibilityHit[] = []

  for (const verb of RESPONSIBILITY_VERBS) {
    let cursor = text.indexOf(verb)
    while (cursor !== -1) {
      const end = cursor + verb.length
      if (!overlapsSpan(vagueSpans, cursor, end)) {
        hits.push({ verb, start: cursor, end })
      }
      cursor = text.indexOf(verb, cursor + 1)
    }
  }

  return hits.sort((left, right) => left.start - right.start)
}

export function findResponsibilityVerbs(text: string): string[] {
  return findResponsibilityHits(text).map((hit) => hit.verb)
}

export function findResultSignals(text: string): string[] {
  const signals: string[] = []

  if (/\d/.test(text)) signals.push('数字')
  if (/%|百分之/.test(text)) signals.push('百分比')
  for (const word of MAGNITUDE_WORDS) {
    if (text.includes(word)) {
      signals.push(word)
      break
    }
  }
  if (COMPARISON_PATTERN.test(text)) signals.push('前后对比')

  return signals
}

export function hasResultSignal(text: string): boolean {
  return findResultSignals(text).length > 0
}

export function hasTechnicalNoun(text: string): boolean {
  const vagueSpans = findPhraseSpans(text, VAGUE_PHRASES)
  const cleaned = text
    .split('')
    .map((char, index) => (overlapsSpan(vagueSpans, index, index + 1) ? '' : char))
    .join('')

  const latin = /[A-Za-z][A-Za-z0-9+#.]*/.exec(cleaned)
  if (latin && !GENERIC_LATIN.has(latin[0].toLowerCase())) return true

  return matchCatalog(cleaned).some(
    (match) =>
      match.kind === 'alias' &&
      match.entry.category !== 'soft' &&
      /[一-鿿]/.test(match.term) &&
      match.term.length >= 4,
  )
}
