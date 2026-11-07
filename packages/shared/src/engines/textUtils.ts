const FULLWIDTH_DIGIT_START = 0xff10
const FULLWIDTH_DIGIT_END = 0xff19
const FULLWIDTH_UPPER_START = 0xff21
const FULLWIDTH_UPPER_END = 0xff3a
const FULLWIDTH_LOWER_START = 0xff41
const FULLWIDTH_LOWER_END = 0xff5a
const FULLWIDTH_OFFSET = 0xfee0
const IDEOGRAPHIC_SPACE = 0x3000
const CJK_PATTERN = /[一-鿿]/
const LATIN_WORD_PATTERN = /[A-Za-z][A-Za-z0-9+#.]*/g
const CJK_RUN_PATTERN = /[一-鿿]+/g

export function toHalfWidth(input: string): string {
  let output = ''
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code === IDEOGRAPHIC_SPACE) {
      output += ' '
    } else if (
      (code >= FULLWIDTH_DIGIT_START && code <= FULLWIDTH_DIGIT_END) ||
      (code >= FULLWIDTH_UPPER_START && code <= FULLWIDTH_UPPER_END) ||
      (code >= FULLWIDTH_LOWER_START && code <= FULLWIDTH_LOWER_END)
    ) {
      output += String.fromCodePoint(code - FULLWIDTH_OFFSET)
    } else {
      output += char
    }
  }
  return output
}

export function stripPunctuation(input: string): string {
  return input.replace(/[，。、；：！？“”‘’（）《》【】,.!?;:'"()\[\]{}<>\-_~`|/\\@#$%^&*+=]/g, '')
}

export function normalizeText(input: string): string {
  const halfWidth = toHalfWidth(input).toLowerCase()
  return stripPunctuation(halfWidth).replace(/\s+/g, '')
}

export function isLatinTerm(term: string): boolean {
  return !CJK_PATTERN.test(term)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsLatinWord(text: string, word: string): boolean {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(word)}(?![A-Za-z0-9])`, 'i')
  return pattern.test(text)
}

export function containsTerm(text: string, term: string): boolean {
  if (!term) return false
  if (isLatinTerm(term)) return containsLatinWord(text, term)
  return text.includes(term)
}

export function tokenize(input: string): string[] {
  const tokens: string[] = []
  const halfWidth = toHalfWidth(input)

  let cursor = 0
  for (const match of halfWidth.matchAll(CJK_RUN_PATTERN)) {
    pushLatinTokens(halfWidth.slice(cursor, match.index), tokens)
    tokens.push(...cjkTokens(match[0]))
    cursor = match.index + match[0].length
  }
  pushLatinTokens(halfWidth.slice(cursor), tokens)

  return tokens
}

function pushLatinTokens(fragment: string, tokens: string[]): void {
  for (const match of fragment.matchAll(LATIN_WORD_PATTERN)) {
    tokens.push(match[0].toLowerCase())
  }
}

function cjkTokens(run: string): string[] {
  if (run.length === 1) return [run]
  const tokens: string[] = []
  for (let index = 0; index < run.length - 1; index += 1) {
    tokens.push(run.slice(index, index + 2))
  }
  return tokens
}

export function bigrams(input: string): string[] {
  const normalized = normalizeText(input)
  if (normalized.length === 0) return []
  if (normalized.length === 1) return [normalized]
  const result: string[] = []
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.push(normalized.slice(index, index + 2))
  }
  return result
}

export function similarity(left: string, right: string): number {
  const leftTokens = bigrams(left)
  const rightTokens = bigrams(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0

  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  let shared = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) shared += 1
  }
  return (2 * shared) / (leftSet.size + rightSet.size)
}
