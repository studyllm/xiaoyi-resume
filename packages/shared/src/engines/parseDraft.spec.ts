import { describe, expect, it } from 'vitest'

import { createIdSeed } from '../domain/ids'
import type { Draft } from '../domain/types'
import type { EngineContext } from './types'
import { HEADER_KEYWORDS, LOW_CONFIDENCE_THRESHOLD, parseDraft } from './parseDraft'

const CTX: EngineContext = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

const STANDARD = `教育背景
清华大学 计算机科学与技术 2015.09 - 2019.06
· 主修数据结构、操作系统与数据库系统

工作经历
字节跳动 前端工程师 2021.03 - 至今
· 负责官网前端架构演进，首屏时间从 3s 降到 1.2s
· 沉淀通用组件库，支撑 20+ 业务线接入

项目经历
在线文档编辑器 2020.01 - 2020.12
· 使用 TypeScript 重写编辑器内核，支持 1000 万字文档编辑

专业技能
前端：Vue、React、TypeScript
后端：Node.js、Go
`

function sectionOf(draft: Draft, kind: string) {
  const section = draft.sections.find((candidate) => candidate.kind === kind)
  if (!section) throw new Error(`missing section ${kind}`)
  return section
}

describe('parseDraft', () => {
  it('rejects empty input', () => {
    const result = parseDraft('   \n  ', CTX, createIdSeed())
    expect(result.ok).toBe(false)
    expect(result.draft).toBeNull()
    expect(result.failure?.reason).toBe('empty')
  })

  it('rejects text without any recognizable structure', () => {
    const result = parseDraft('asdkjhaskdjhaskjdh\nqwertyuiopasdfgh', CTX, createIdSeed())
    expect(result.ok).toBe(false)
    expect(result.draft).toBeNull()
    expect(result.failure?.reason).toBe('unrecognized')
  })

  it('parses a standard chinese resume into the four known sections', () => {
    const result = parseDraft(STANDARD, CTX, createIdSeed())
    expect(result.ok).toBe(true)
    expect(result.failure).toBeNull()
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)

    const draft = result.draft!
    expect(draft.sections.map((section) => section.kind)).toEqual([
      'education',
      'experience',
      'project',
      'skills',
    ])
  })

  it('reads the organisation, the title and the dates of an experience entry', () => {
    const draft = parseDraft(STANDARD, CTX, createIdSeed()).draft!
    const [item] = sectionOf(draft, 'experience').items
    expect(item!.org).toBe('字节跳动')
    expect(item!.title).toBe('前端工程师')
    expect(item!.start).toBe('2021-03')
    expect(item!.end).toBeNull()
    expect(item!.present).toBe(true)
    expect(item!.bullets).toHaveLength(2)
    expect(item!.bullets[0]!.text).toBe('负责官网前端架构演进，首屏时间从 3s 降到 1.2s')
  })

  it('reads a closed date range', () => {
    const draft = parseDraft(STANDARD, CTX, createIdSeed()).draft!
    const [item] = sectionOf(draft, 'education').items
    expect(item!.org).toBe('清华大学')
    expect(item!.title).toBe('计算机科学与技术')
    expect(item!.start).toBe('2015-09')
    expect(item!.end).toBe('2019-06')
  })

  it('reads a project entry without a title', () => {
    const draft = parseDraft(STANDARD, CTX, createIdSeed()).draft!
    const [item] = sectionOf(draft, 'project').items
    expect(item!.org).toBe('在线文档编辑器')
    expect(item!.title).toBeUndefined()
    expect(item!.start).toBe('2020-01')
    expect(item!.end).toBe('2020-12')
  })

  it('keeps every skill line as a bullet of the skills section', () => {
    const draft = parseDraft(STANDARD, CTX, createIdSeed()).draft!
    const section = sectionOf(draft, 'skills')
    expect(section.items).toHaveLength(1)
    expect(section.items[0]!.bullets).toHaveLength(2)
    expect(section.items[0]!.bullets[0]!.text).toBe('前端：Vue、React、TypeScript')
  })

  it('gives every bullet a unique identifier', () => {
    const draft = parseDraft(STANDARD, CTX, createIdSeed()).draft!
    const ids = draft.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id)),
    )
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('falls back to heuristics when no section header is present', () => {
    const text = `字节跳动 前端工程师 2021.03 - 至今
· 负责官网前端架构演进，首屏时间从 3s 降到 1.2s
· 沉淀通用组件库，支撑 20+ 业务线接入`
    const result = parseDraft(text, CTX, createIdSeed())
    expect(result.ok).toBe(true)
    expect(result.confidence).toBeLessThan(0.6)
    expect(result.warnings.length).toBeGreaterThan(0)

    const section = sectionOf(result.draft!, 'experience')
    expect(section.items).toHaveLength(1)
    expect(section.items[0]!.bullets).toHaveLength(2)
  })

  it('keeps the canonical section order when the headers are shuffled', () => {
    const text = `项目经历
在线文档编辑器 2020.01 - 2020.12
· 使用 TypeScript 重写编辑器内核

工作经历
字节跳动 前端工程师 2021.03 - 至今
· 负责官网前端架构演进

教育背景
清华大学 计算机科学与技术 2015.09 - 2019.06
· 主修数据结构

专业技能
前端：Vue、React`
    const draft = parseDraft(text, CTX, createIdSeed()).draft!
    expect(draft.sections.map((section) => section.kind)).toEqual([
      'education',
      'experience',
      'project',
      'skills',
    ])
    expect(sectionOf(draft, 'project').items).toHaveLength(1)
    expect(sectionOf(draft, 'experience').items).toHaveLength(1)
    expect(sectionOf(draft, 'education').items).toHaveLength(1)
    expect(sectionOf(draft, 'skills').items).toHaveLength(1)
  })

  it('parses a resume that only holds projects', () => {
    const text = `项目经历
在线文档编辑器 2020.01 - 2020.12
· 使用 TypeScript 重写编辑器内核`
    const result = parseDraft(text, CTX, createIdSeed())
    expect(result.ok).toBe(true)
    const draft = result.draft!
    expect(sectionOf(draft, 'project').items).toHaveLength(1)
    expect(sectionOf(draft, 'experience').items).toHaveLength(0)
    expect(sectionOf(draft, 'education').items).toHaveLength(0)
  })

  it('parses a skills only text', () => {
    const result = parseDraft('熟悉 Vue、React、TypeScript，具备良好的沟通能力', CTX, createIdSeed())
    expect(result.ok).toBe(true)
    expect(result.confidence).toBeLessThan(0.6)
    const section = sectionOf(result.draft!, 'skills')
    expect(section.items).toHaveLength(1)
    expect(section.items[0]!.bullets).toHaveLength(1)
  })

  it('produces the same result for the same input', () => {
    const first = parseDraft(STANDARD, CTX, createIdSeed())
    const second = parseDraft(STANDARD, CTX, createIdSeed())
    expect(JSON.stringify(first.draft)).toBe(JSON.stringify(second.draft))
  })
})

/**
 * 真实简历里分区表头的写法。
 * 每一项是「表头原文 → 应当归属的分区」。
 */
const HEADER_CORPUS: Array<[string, string]> = [
  ['教育背景', 'education'], ['教育经历', 'education'], ['教育情况', 'education'],
  ['学习经历', 'education'], ['学历背景', 'education'], ['教育', 'education'],
  ['教育与培训', 'education'], ['Education', 'education'], ['Educational Background', 'education'],
  ['工作经历', 'experience'], ['工作经验', 'experience'], ['工作履历', 'experience'],
  ['职业经历', 'experience'], ['实习经历', 'experience'], ['任职经历', 'experience'],
  ['工作', 'experience'], ['工作背景', 'experience'],
  ['Work Experience', 'experience'], ['Professional Experience', 'experience'],
  ['Experience', 'experience'], ['Career History', 'experience'],
  ['项目经历', 'project'], ['项目经验', 'project'], ['项目实践', 'project'],
  ['主要项目', 'project'], ['代表性项目', 'project'], ['项目', 'project'],
  ['Projects', 'project'], ['Project Experience', 'project'], ['Selected Projects', 'project'],
  ['专业技能', 'skills'], ['技术技能', 'skills'], ['核心技能', 'skills'],
  ['技能特长', 'skills'], ['个人技能', 'skills'], ['技术栈', 'skills'],
  ['IT技能', 'skills'], ['核心优势', 'skills'], ['个人能力', 'skills'],
  ['专业能力', 'skills'], ['擅长技能', 'skills'],
  ['Core Competencies', 'skills'], ['Core Skills', 'skills'],
  ['Technical Skills', 'skills'], ['Skills', 'skills'], ['Skill Highlights', 'skills'],
  ['一、教育背景', 'education'], ['1. 工作经历', 'experience'],
  ['【项目经历】', 'project'], ['◆ 专业技能', 'skills'],
  ['教育背景 Education', 'education'], ['工作经历 Experience', 'experience'],
]

describe('parseDraft 的分区表头识别', () => {
  it('常见的同义、英文与带装饰的写法都能被认成分区表头', () => {
    const missed: string[] = []
    const wrong: string[] = []

    for (const [header, expected] of HEADER_CORPUS) {
      const result = parseDraft(`${header}\n占位内容\n`, CTX, createIdSeed())
      // 置信度低于阈值说明一个表头都没认出来，走了启发式
      if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
        missed.push(header)
        continue
      }
      const section = result.draft!.sections.find((candidate) => candidate.items.length > 0)
      if (section && section.kind !== expected) wrong.push(`${header} → ${section.kind}`)
    }

    expect(missed).toEqual([])
    expect(wrong).toEqual([])
  })

  it('要点不会被误判成分区表头', () => {
    const bullets = [
      '工作负责得很全面',
      '项目经验丰富的求职者',
      '技能熟练掌握 Vue 与 React',
      '教育背景良好',
      '工作十年以上经验',
      '项目主导过三个大型系统',
    ]
    const eaten: string[] = []

    for (const bullet of bullets) {
      const result = parseDraft(
        `工作经历\n美团 前端工程师 2021-03 - 至今\n${bullet}\n`,
        CTX,
        createIdSeed(),
      )
      const kept = result.draft!.sections
        .flatMap((section) => section.items)
        .flatMap((item) => item.bullets)
        .map((entry) => entry.text)
      if (!kept.includes(bullet)) eaten.push(bullet)
    }

    expect(eaten).toEqual([])
  })

  it('复合表头按第一个分区认', () => {
    const result = parseDraft('工作经历与项目经历\n占位内容\n', CTX, createIdSeed())
    const section = result.draft!.sections.find((candidate) => candidate.items.length > 0)
    expect(section?.kind).toBe('experience')
  })

  it('关键词表里没有重复项，且短词不排在长词前面', () => {
    for (const { keywords } of HEADER_KEYWORDS) {
      const normalized = keywords.map((keyword) => keyword.replace(/[\s：:，,。.、]/g, ''))
      expect(new Set(normalized).size).toBe(normalized.length)
      for (let i = 0; i < normalized.length; i += 1) {
        for (let j = i + 1; j < normalized.length; j += 1) {
          expect(normalized[j].startsWith(normalized[i])).toBe(false)
        }
      }
    }
  })
})

describe('parseDraft 的「其它」分区', () => {
  const WITH_OTHER = `工作经历
美团 前端工程师 2021-03 - 至今
· 负责公司营销活动页面的前端开发
自我评价
· 团队协作良好，认真负责
获奖经历
· 年度技术突破奖
`

  it('其它类表头下面的内容进「其它」分区', () => {
    const result = parseDraft(WITH_OTHER, CTX, createIdSeed())
    expect(result.ok).toBe(true)

    const other = result.draft!.sections.find((section) => section.kind === 'other')
    expect(other).toBeDefined()
    expect(other!.items.length).toBe(1)
    expect(other!.items[0]!.bullets.map((bullet) => bullet.text)).toEqual([
      '团队协作良好，认真负责',
      '年度技术突破奖',
    ])
  })

  it('其它类表头不再被并进上一个分区', () => {
    const result = parseDraft(WITH_OTHER, CTX, createIdSeed())
    const experience = result.draft!.sections.find((section) => section.kind === 'experience')
    expect(experience!.items[0]!.bullets.map((bullet) => bullet.text)).toEqual([
      '负责公司营销活动页面的前端开发',
    ])
  })

  it('被放进「其它」的表头会被列出来', () => {
    const result = parseDraft(WITH_OTHER, CTX, createIdSeed())
    expect(result.otherHeaders).toEqual(['自我评价', '获奖经历'])
  })

  it('没有其它类表头时清单是空的', () => {
    const result = parseDraft(STANDARD, CTX, createIdSeed())
    expect(result.otherHeaders).toEqual([])
  })

  it('没有其它类表头时不产生「其它」分区', () => {
    const result = parseDraft(STANDARD, CTX, createIdSeed())
    const other = result.draft!.sections.find((section) => section.kind === 'other')
    expect(other).toBeUndefined()
    expect(result.confidence).toBe(1)
  })

  it('「其它」为空时不产生解析警告', () => {
    const result = parseDraft(STANDARD, CTX, createIdSeed())
    expect(result.warnings.some((warning) => warning.includes('其它'))).toBe(false)
  })

  it('普通要点不会被当成其它类表头', () => {
    const result = parseDraft(
      `工作经历\n美团 前端工程师 2021-03 - 至今\n沟通良好\n责任心强\n`,
      CTX,
      createIdSeed(),
    )
    expect(result.otherHeaders).toEqual([])
    const experience = result.draft!.sections.find((section) => section.kind === 'experience')
    expect(experience!.items[0]!.bullets.map((bullet) => bullet.text)).toEqual([
      '沟通良好',
      '责任心强',
    ])
  })

  it('解析失败时清单是空的', () => {
    const result = parseDraft('   \n  ', CTX, createIdSeed())
    expect(result.otherHeaders).toEqual([])
  })
})

describe('parseDraft 的条目排序', () => {
  const OUT_OF_ORDER = `工作经历
阿里巴巴 高级工程师 2019.03 - 2021.05
· 负责搜索相关性

字节跳动 资深工程师 2023.07 - 至今
· 负责推荐系统

腾讯 前端工程师 2021.06 - 2023.06
· 负责后台系统
`

  it('按开始时间倒序排——最近的一段在最前面', () => {
    const result = parseDraft(OUT_OF_ORDER, CTX, createIdSeed())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const starts = sectionOf(result.draft!, 'experience').items.map((item) => item.start)
    expect(starts).toEqual(['2023-07', '2021-06', '2019-03'])
  })

  it('缺开始时间的条目排在后面，彼此保持原文顺序', () => {
    const result = parseDraft(
      `工作经历
· 只有要点没有条目头

阿里巴巴 高级工程师 2019.03 - 2021.05
· 负责搜索相关性
`,
      CTX,
      createIdSeed(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const items = sectionOf(result.draft!, 'experience').items
    expect(items[items.length - 1]!.start).toBeUndefined()
    expect(items[0]!.start).toBe('2019-03')
  })
})
