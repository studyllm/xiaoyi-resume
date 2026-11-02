import { CATALOG } from './catalog'
import { toHalfWidth } from './textUtils'

export interface TransformOptions {
  allowVerbFronting?: boolean
}

export interface ForbiddenTransform {
  id: string
  description: string
}

export const FORBIDDEN_TRANSFORMS: ForbiddenTransform[] = [
  { id: 'verb-strength-up', description: '动词强度上调，例如把「参与」写成「负责」或「主导」' },
  { id: 'verb-strength-down', description: '动词强度下调，例如把「主导」写成「参与」' },
  { id: 'new-number', description: '新增数字或指标' },
  { id: 'new-entity', description: '新增公司、项目、技术名词等实体' },
  { id: 'new-responsibility', description: '新增简历中不存在的职责' },
  { id: 'time-change', description: '修改时间' },
  { id: 'causal-stitching', description: '因果缝合，例如把并列的两件事改写成因果关系' },
  { id: 'keyword-injection', description: '把 JD 关键词注入与它无关的要点' },
  { id: 'rating-up', description: '技能评级上调，例如把「熟悉」写成「精通」' },
  { id: 'number-precision-change', description: '数字精度变化，例如把 3.5 写成 3.75' },
]

const COLLABORATION_MARKERS = ['协助', '共同', '配合', '支持', '参与', '协同', '联合', '一起']

const RATING_UP_WORDS = ['精通', '专家', '资深专家', '大师']

const CASE_DENYLIST = new Set([
  'ES',
  'PG',
  'IM',
  'CR',
  'JS',
  'TS',
  'MQ',
  'UI',
  'BI',
  'PM',
  'QA',
  'Go',
  'API',
  'CPU',
  'GPU',
  'IDE',
  'SDK',
  'CLI',
  'SPA',
  'SSR',
  'SaaS',
  'C#',
  'C++',
  'CRUD',
  'HTML',
  'CSS3',
  'Lucene',
  'Nuxt.js',
  'NextJS',
  'AntD',
  'ElementUI',
  'Element UI',
  'Element Plus',
])

const CJK_PATTERN = /[一-鿿]/
const LATIN_WORD_PATTERN = /[A-Za-z][A-Za-z0-9+#.]*/g
const NUMBER_PATTERN = /\d+(?:\.\d+)?%?/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** T1 删除行首的项目符号与多余空白 */
function stripBulletMarker(text: string): string {
  return text.replace(/^\s*[·•‧▪●*\-]\s*/, '').trim()
}

/** T5 目录内技术词统一大小写 */
function normalizeCatalogCase(text: string): string {
  const terms = CATALOG.flatMap((entry) => entry.aliases)
    .filter((alias) => /^[A-Za-z][A-Za-z0-9+#.]*$/.test(alias))
    .filter((alias) => alias.length >= 3 && !CASE_DENYLIST.has(alias))
    .sort((left, right) => right.length - left.length)

  let output = text
  const masked = new Array<boolean>(text.length).fill(false)

  for (const term of terms) {
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, 'gi')
    for (const match of output.matchAll(pattern)) {
      const start = match.index
      const end = start + match[0].length
      let covered = false
      for (let index = start; index < end; index += 1) {
        if (masked[index]) {
          covered = true
          break
        }
      }
      if (covered) continue
      for (let index = start; index < end; index += 1) masked[index] = true
      output = output.slice(0, start) + term + output.slice(end)
    }
  }

  return output
}

/** T2 全角半角与中英文间距规范化 */
function normalizeSpacing(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([一-鿿])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([一-鿿])/g, '$1 $2')
    .trim()
}

/** T3 删除句首纯衔接状语 */
function stripLeadingAdverbial(text: string): string {
  return text.replace(/^(在[^，。；]{1,20}期间[，,]|同时[，,]|此外[，,]|另外[，,]|并且[，,])/, '')
}

/** T4 动词前置：负责X的开发 → 开发X */
function frontVerb(text: string): string {
  const matched = /^(负责|参与)(.+?)的(开发|设计|实现|维护|建设)$/.exec(text)
  if (!matched) return text
  const [, , object, verb] = matched
  return `${verb}${object}`
}

/** T6 去掉句末标点 */
function stripTrailingPunctuation(text: string): string {
  return text.replace(/[。．.，,、；;：:！!？?]+$/, '')
}

export function applyTransforms(text: string, options: TransformOptions = {}): string {
  const { allowVerbFronting = true } = options

  let output = stripBulletMarker(text)
  output = toHalfWidth(output)
  output = normalizeCatalogCase(output)
  output = normalizeSpacing(output)
  output = stripLeadingAdverbial(output)

  if (allowVerbFronting && !COLLABORATION_MARKERS.some((marker) => output.includes(marker))) {
    output = frontVerb(output)
  }

  output = stripTrailingPunctuation(output)
  return output
}

export interface FactsAddedContext {
  metadata?: string
}

function cjkCharacters(text: string): string[] {
  return [...text].filter((char) => CJK_PATTERN.test(char))
}

function latinWords(text: string): string[] {
  return [...text.matchAll(LATIN_WORD_PATTERN)].map((match) => match[0])
}

function numbers(text: string): string[] {
  return [...text.matchAll(NUMBER_PATTERN)].map((match) => match[0])
}

/**
 * 不变量校验：输出不得引入原句与条目元信息之外的事实。
 * 返回空数组表示通过；返回的每一条都是一处异常。
 */
export function assertNoFactsAdded(
  source: string,
  output: string,
  context: FactsAddedContext = {},
): string[] {
  const violations: string[] = []
  const metadata = context.metadata ?? ''
  const normalizedSource = toHalfWidth(source)
  const normalizedOutput = toHalfWidth(output)
  const normalizedMetadata = toHalfWidth(metadata)

  for (const token of numbers(normalizedOutput)) {
    if (!normalizedSource.includes(token) && !normalizedMetadata.includes(token)) {
      violations.push(`出现了原句中没有的数字「${token}」`)
    }
  }

  const allowedLatin = new Set(
    latinWords(`${normalizedSource} ${normalizedMetadata}`).map((word) => word.toLowerCase()),
  )
  for (const word of latinWords(normalizedOutput)) {
    if (word.length < 2) continue
    if (!allowedLatin.has(word.toLowerCase())) {
      violations.push(`出现了原句中没有的名词「${word}」`)
    }
  }

  const sourceChars = new Set(cjkCharacters(normalizedSource))
  for (const char of cjkCharacters(normalizedOutput)) {
    if (!sourceChars.has(char)) {
      violations.push(`出现了原句中没有的字「${char}」`)
    }
  }

  const sourceLength = cjkCharacters(normalizedSource).length
  const outputLength = cjkCharacters(normalizedOutput).length
  if (outputLength > sourceLength + 4) {
    violations.push(`中文长度比原句多了 ${outputLength - sourceLength} 个字`)
  }

  for (const word of RATING_UP_WORDS) {
    if (normalizedOutput.includes(word) && !normalizedSource.includes(word)) {
      violations.push(`技能评级被上调为「${word}」`)
    }
  }

  return violations
}
