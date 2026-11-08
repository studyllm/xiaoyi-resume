/**
 * 事实账本与声明账本。
 *
 * 「不编造」这条承诺原来靠逐字比对兜着：输出的每个汉字都得在原句里出现过。
 * 那条规则对规则引擎够用（它本来就在重排字符），但拦不住语义上的编造，也
 * 没法说清「哪一条输出依据了哪一条事实」。
 *
 * 这里换成声明级判定（ADR-0003）：
 * - **fact**：底稿要点按句读切出的子句，带一组确定性的成分。
 * - **claim**：输出的一条断言，带着它依据的 fact。
 * - 判定只看「claim 的成分是否被它引用的 fact 支撑」。
 */
import type { Draft, IntegrityIssueKind, ResumeVersion } from '../domain/types'

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

export type ClaimIssueKind = IntegrityIssueKind

export interface ClaimIssue {
  kind: ClaimIssueKind
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

// ---------------------------------------------------------------- 成分

/** 技能评级强度序：了解 < 熟悉 < 掌握 < 精通 < 专家。 */
const RATING_STRENGTH: Record<string, number> = {
  了解: 0,
  熟悉: 1,
  掌握: 2,
  精通: 3,
  专家: 4,
}

/** 职责动词强度序：位次越大越强。降级允许，上调拦截。 */
const VERB_STRENGTH: Record<string, number> = {
  知道: 0,
  听说: 0,
  使用: 2,
  运用: 2,
  参与: 3,
  协助: 3,
  配合: 3,
  支持: 3,
  协同: 3,
  联合: 3,
  一起: 3,
  共同: 3,
  负责: 4,
  承担: 4,
  主导: 5,
  推动: 5,
  牵头: 5,
  创立: 6,
  创办: 6,
  搭建: 6,
}

/** 数字与单位。「120s」「30%」「3.7」都是度量。 */
const MEASURE_PATTERN = /\d+(?:\.\d+)?\s*(?:%|ms|毫秒|秒|s|分钟|分|小时|天|周|个月|年|KB|MB|GB|TB|PB)?/g

/** 拉丁词。「Vue」「React」「K8s」「Node.js」。 */
const ENTITY_PATTERN = /[A-Za-z][A-Za-z0-9+#.]*/g

/** 中文虚词与连接词——切实词时在它们前面断开。 */
const TERM_BREAKS = '的了和与及或并而但也都还把被让为以对从到就之'

const TERM_SEPARATOR = /[，。；：、！？「」『』（）()【】\[\]…—\-\s]+/

/**
 * 子句切分点：句读 + 连接词。
 *
 * **不在空格处切**——中文简历里的空格基本都围着拉丁词（「引入 Vue 3 与 Vite」），
 * 切开就等于把一个技术栈拆成三个事实。
 */
const CLAUSE_SEPARATOR = /[。；，、！？：]+|同时|另外|并/

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

/** 度量的比较键：数值 + 单位。单位可以省略。 */
function measureKey(text: string): { value: number; unit: string } | null {
  const match = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(text.trim())
  if (!match) return null
  return { value: Number(match[1]), unit: match[2] ?? '' }
}

function sameMeasure(left: string, right: string): boolean {
  const a = measureKey(left)
  const b = measureKey(right)
  if (!a || !b) return left === right
  if (a.value !== b.value) return false
  return a.unit === b.unit || a.unit === '' || b.unit === ''
}

/** 中文实词：按虚词与标点切出来、长度至少两个字且含汉字的连续片段。 */
export function extractTerms(text: string): string[] {
  const pieces = text.split(TERM_SEPARATOR).filter(Boolean)
  const terms: string[] = []
  for (const piece of pieces) {
    let buffer = ''
    for (const char of piece) {
      if (TERM_BREAKS.includes(char)) {
        if (isTerm(buffer)) terms.push(buffer)
        buffer = ''
        continue
      }
      buffer += char
    }
    if (isTerm(buffer)) terms.push(buffer)
  }
  return unique(terms)
}

const CJK_PATTERN = /[一-鿿]/

/** 拉丁词由 R2（entity）管，实词只管中文。 */
function isTerm(buffer: string): boolean {
  return buffer.length >= 2 && CJK_PATTERN.test(buffer)
}

/** 从一段文字里抽出它的成分。纯规则，不含随机、不读时间。 */
export function extractComponents(text: string): FactComponent[] {
  const components: FactComponent[] = []

  for (const match of text.matchAll(MEASURE_PATTERN)) {
    const value = match[0].trim()
    if (!value) continue
    components.push({ kind: 'measure', text: value })
  }

  for (const match of text.matchAll(ENTITY_PATTERN)) {
    const value = match[0]
    if (value.length < 2) continue
    components.push({ kind: 'entity', text: value })
  }

  for (const [word, strength] of Object.entries(RATING_STRENGTH)) {
    if (!text.includes(word)) continue
    components.push({ kind: 'rating', text: word, strength })
  }

  for (const [word, strength] of Object.entries(VERB_STRENGTH)) {
    if (!text.includes(word)) continue
    components.push({ kind: 'verb', text: word, strength })
  }

  // 实词里去掉评级与动词：它们有自己的强度规则（上调拦、降级放）。
  // 留着的话，「主导」改成「参与」这种弱化会被实词规则当成新词拦掉——
  // 降级就永远走不到它自己的规则。
  const withoutRated = text.replace(
    new RegExp([...Object.keys(RATING_STRENGTH), ...Object.keys(VERB_STRENGTH)].join('|'), 'g'),
    '',
  )
  for (const term of extractTerms(withoutRated)) {
    components.push({ kind: 'term', text: term })
  }

  return components
}

// ---------------------------------------------------------------- fact

/**
 * 确定性哈希。
 *
 * 不用 `node:crypto`——共享包要在浏览器里跑。FNV-1a 跑两路不同偏移，拼成 64 位。
 * 要的是「同一输入同一输出」，不是密码学强度。
 */
function hashText(text: string): string {
  let low = 0x811c9dc5
  let high = 0x9dc5811c
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    low = Math.imul(low ^ code, 0x01000193)
    high = Math.imul(high ^ code, 0x85ebca6b)
  }
  const left = (low >>> 0).toString(16).padStart(8, '0')
  const right = (high >>> 0).toString(16).padStart(8, '0')
  return left + right
}

function factIdOf(bulletId: string, text: string): string {
  // 把 bulletId 一起哈希：同一个子句出现在两条要点里时不该撞成同一个 fact
  return hashText(`${bulletId}|${text}`).slice(0, 16)
}

/** 把一条要点按句读切成子句。 */
export function splitClauses(text: string): Array<{ text: string; span: { start: number; end: number } }> {
  const clauses: Array<{ text: string; span: { start: number; end: number } }> = []
  let cursor = 0

  for (const piece of text.split(CLAUSE_SEPARATOR)) {
    if (!piece) continue
    const start = text.indexOf(piece, cursor)
    if (start === -1) continue
    const end = start + piece.length
    cursor = end
    clauses.push({ text: piece, span: { start, end } })
  }

  return clauses
}

/**
 * 把底稿拆成事实，按所属要点分组。
 *
 * 分组是判定的前提：一条输出要点引用的是**它来源的那条要点**的事实，
 * 而不是整份底稿的事实——否则「从别处搬一个数字过来」就查不出来了。
 */
export function extractFactsByBullet(draft: Draft): Map<string, Fact[]> {
  const byBullet = new Map<string, Fact[]>()

  for (const section of draft.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        const facts: Fact[] = []
        for (const clause of splitClauses(bullet.text)) {
          facts.push({
            factId: factIdOf(bullet.id, clause.text),
            text: clause.text,
            span: clause.span,
            components: extractComponents(clause.text),
          })
        }
        byBullet.set(bullet.id, facts)
      }
    }
  }

  return byBullet
}

/** 把底稿拆成事实。 */
export function extractFacts(draft: Draft): Fact[] {
  return [...extractFactsByBullet(draft).values()].flat()
}

// ---------------------------------------------------------------- claim

/** 去掉空白与标点，只留实义字符。 */
function stripContent(text: string): string {
  return text.replace(/[\s，。；：、！？「」『』（）()【】\[\]…—\-.,;:!?"'“”‘’]/g, '')
}

/** 实质相等：忽略空白与标点。 */
export function sameContent(left: string, right: string): boolean {
  return stripContent(left) === stripContent(right)
}

export interface ClaimProduction {
  claims: Claim[]
  /** 输出要点 → 它依据的 fact。回退时按这个换。 */
  factsByBullet: Map<string, Fact[]>
}

/**
 * 造一条声明。
 *
 * 一条输出要点一条 claim，引用来源要点的全部 fact——回退的粒度也是要点。
 */
export function makeClaim(params: {
  claimId: string
  bulletId: string
  text: string
  operation: ClaimOperation
  sourceFactIds: string[]
}): Claim {
  return {
    claimId: params.claimId,
    bulletId: params.bulletId,
    text: params.text,
    span: { start: 0, end: params.text.length },
    sourceFactIds: params.sourceFactIds,
    operation: params.operation,
    confidence: 1,
  }
}

/**
 * 规则引擎当第一个 claim 生产者。
 *
 * 每条底稿要点产出一条 claim（ADR-0003 §3）：
 * - 原样保留的：`keep`
 * - 改写过的：`rewrite`
 * - 被丢掉的：`delete`，文本为空
 */
export function produceClaims(draft: Draft, version: ResumeVersion): ClaimProduction {
  const factsByBullet = extractFactsByBullet(draft)
  const versionBullets = new Map<string, string>()
  for (const section of version.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) {
        versionBullets.set(bullet.id, bullet.text)
      }
    }
  }

  const claims: Claim[] = []
  let counter = 0

  for (const diff of version.diff) {
    counter += 1
    const sourceFactIds = (factsByBullet.get(diff.bulletId) ?? []).map((fact) => fact.factId)

    if (diff.change === 'remove') {
      claims.push(
        makeClaim({
          claimId: `claim-${counter}`,
          bulletId: diff.bulletId,
          text: '',
          operation: 'delete',
          sourceFactIds,
        }),
      )
      continue
    }

    const text = versionBullets.get(diff.bulletId) ?? diff.toText ?? ''
    claims.push(
      makeClaim({
        claimId: `claim-${counter}`,
        bulletId: diff.bulletId,
        text,
        operation: diff.change === 'rewrite' ? 'rewrite' : 'keep',
        sourceFactIds,
      }),
    )
  }

  return { claims, factsByBullet }
}

// ---------------------------------------------------------------- 判定

export interface VerifyOptions {
  /** 底稿全量的中文实词。R5 用它——「这个词在整份底稿里出现过吗」。 */
  draftTerms: string[]
  /** 条目元数据（公司、职位）的成分。它也是这份简历里的事实。 */
  metadataComponents: FactComponent[]
}

/**
 * 元数据只提供名字与数字，不提供技能评级与职责强度。
 *
 * 职位名里的「负责人」不该给正文里的「负责」背书——那是职位的职责，
 * 不是求职者做过的事（ADR-0003 §2 说元数据提供的是拉丁词与专名）。
 */
function metadataSupport(components: FactComponent[]): FactComponent[] {
  return components.filter(
    (component) => component.kind === 'entity' || component.kind === 'measure',
  )
}

interface ComponentCheck {
  issues: ClaimIssue[]
  observations: ClaimObservation[]
}

/** 拿一组成分去核一段文本。 */
function checkComponents(
  text: string,
  supported: FactComponent[],
  draftTerms: string[],
): ComponentCheck {
  const issues: ClaimIssue[] = []
  const observations: ClaimObservation[] = []

  for (const component of extractComponents(text)) {
    if (component.kind === 'measure') {
      const found = supported.some(
        (item) => item.kind === 'measure' && sameMeasure(item.text, component.text),
      )
      if (!found) {
        issues.push({
          kind: 'unsupported-measure',
          component: component.text,
          detail: `出现了没有依据的数字「${component.text}」`,
        })
      }
      continue
    }

    if (component.kind === 'entity') {
      const found = supported.some(
        (item) => item.kind === 'entity' && item.text.toLowerCase() === component.text.toLowerCase(),
      )
      if (!found) {
        issues.push({
          kind: 'unsupported-entity',
          component: component.text,
          detail: `出现了没有依据的名词「${component.text}」`,
        })
      }
      continue
    }

    if (component.kind === 'rating') {
      const strengths = supported
        .filter((item) => item.kind === 'rating')
        .map((item) => item.strength ?? 0)
      const ceiling = strengths.length ? Math.max(...strengths) : -1
      if (component.strength !== undefined && component.strength > ceiling) {
        issues.push({
          kind: 'rating-up',
          component: component.text,
          detail: `技能评级被上调为「${component.text}」`,
        })
      }
      continue
    }

    if (component.kind === 'verb') {
      const verbs = supported.filter((item) => item.kind === 'verb')
      // 底稿里就是这个动词：照抄，不构成上调。
      if (verbs.some((item) => item.text === component.text)) continue

      const ceiling = verbs.length ? Math.max(...verbs.map((item) => item.strength ?? 0)) : -1
      if (component.strength !== undefined && component.strength > ceiling) {
        issues.push({
          kind: 'verb-strength-up',
          component: component.text,
          detail: `职责被上调为「${component.text}」`,
        })
        continue
      }
      if (ceiling > (component.strength ?? 0)) {
        observations.push({
          kind: 'verb-strength-down',
          detail: `职责由更强的表述弱化为「${component.text}」`,
        })
      }
      continue
    }

    if (component.kind === 'term') {
      // R5：这个词得在底稿里出现过。逐字出现在某个实词里就算。
      // 比对不分大小写——引擎会把「vue」规范成「Vue」，那是同一个词。
      const needle = component.text.toLowerCase()
      const found = draftTerms.some((term) => {
        const haystack = term.toLowerCase()
        return haystack.includes(needle) || needle.includes(haystack)
      })
      if (!found) {
        issues.push({
          kind: 'unsupported-term',
          component: component.text,
          detail: `出现了底稿里没有的词「${component.text}」`,
        })
      }
    }
  }

  return { issues, observations }
}

/** 判定一条 claim。 */
export function verifyClaim(
  claim: Claim,
  facts: Fact[],
  options: VerifyOptions,
): ClaimVerdict {
  const issues: ClaimIssue[] = []
  const observations: ClaimObservation[] = []
  const cited = facts.filter((fact) => claim.sourceFactIds.includes(fact.factId))

  if (claim.sourceFactIds.length === 0) {
    if (claim.text.trim()) {
      issues.push({ kind: 'unreferenced', detail: '这条断言没有引用任何事实' })
    }
    return { claimId: claim.claimId, bulletId: claim.bulletId, trusted: false, issues, observations }
  }

  if (claim.operation === 'delete') {
    if (claim.text.trim()) {
      issues.push({ kind: 'delete-mismatch', detail: '删除类断言不该有文本' })
    }
    return {
      claimId: claim.claimId,
      bulletId: claim.bulletId,
      trusted: issues.length === 0,
      issues,
      observations,
    }
  }

  if (claim.operation === 'keep') {
    // R7：保留类断言只能是它引用的那些事实的原样，不能多出内容。
    if (cited.length === 1) {
      if (!sameContent(cited[0]!.text, claim.text)) {
        issues.push({ kind: 'keep-mismatch', detail: '保留类断言与它引用的事实对不上' })
      }
    } else {
      const factsText = cited.map((fact) => stripContent(fact.text))
      const extra = splitClauses(claim.text).filter(
        (clause) => !factsText.some((fact) => fact.includes(stripContent(clause.text))),
      )
      if (extra.length > 0) {
        issues.push({ kind: 'keep-mismatch', detail: '保留类断言与它引用的事实对不上' })
      }
    }
  }

  // 先严后松：每条被引用的 fact 单独核一遍（严），再核它们的并集（松）。
  const strictFailed = cited.some((fact) =>
    checkComponents(claim.text, fact.components, options.draftTerms).issues.length > 0,
  )
  const loose = checkComponents(
    claim.text,
    [...cited.flatMap((fact) => fact.components), ...metadataSupport(options.metadataComponents)],
    options.draftTerms,
  )

  issues.push(...loose.issues)
  observations.push(...loose.observations)

  if (cited.length > 1 && strictFailed && loose.issues.length === 0) {
    observations.push({
      kind: 'assembled-from-facts',
      detail: `这条断言由 ${cited.length} 条事实拼合而成`,
    })
  }

  return {
    claimId: claim.claimId,
    bulletId: claim.bulletId,
    trusted: issues.length === 0,
    issues,
    observations,
  }
}

/** 判定全部 claim。 */
export function verifyClaims(
  claims: Claim[],
  facts: Fact[],
  options: VerifyOptions,
): ClaimVerdict[] {
  const byId = new Map(facts.map((fact) => [fact.factId, fact]))
  return claims.map((claim) =>
    verifyClaim(
      claim,
      claim.sourceFactIds
        .map((id) => byId.get(id))
        .filter((fact): fact is Fact => Boolean(fact)),
      options,
    ),
  )
}
