import { describe, expect, it } from 'vitest'

import { createIdSeed } from '@/domain/ids'
import type { Draft } from '@/domain/types'
import type { EngineContext } from './types'
import { parseDraft } from './parseDraft'

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

  it('parses a standard chinese resume into the four sections', () => {
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
