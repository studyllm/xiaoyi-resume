import { describe, expect, it } from 'vitest'

import { createIdSeed } from '../domain/ids'
import { extractCorePhrases, parseJd } from './jd'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

const JD = `美团 前端工程师

岗位职责：
· 负责公司中台业务系统的前端开发与维护
· 参与前端基础设施建设

任职要求：
1. 精通 Vue 和 TypeScript
2. 熟悉 Docker 与 CI/CD 流程

福利待遇：
· 五险一金
· 补充商业保险
`

describe('parseJd', () => {
  it('reads the role name from the first line', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    expect(jd.roleName).toBe('美团 前端工程师')
    expect(jd.roleNameSource).toBe('first-line')
  })

  it('prefers an explicit role label', () => {
    const { jd } = parseJd('岗位：高级前端工程师\n负责前端架构建设', CTX, createIdSeed())
    expect(jd.roleName).toBe('高级前端工程师')
    expect(jd.roleNameSource).toBe('explicit')
  })

  it('reads a role name from a recruitment phrase', () => {
    const { jd } = parseJd('招聘 Node.js 后端工程师\n负责服务端开发', CTX, createIdSeed())
    expect(jd.roleName).toBe('Node.js 后端工程师')
    expect(jd.roleNameSource).toBe('pattern')
  })

  it('falls back to a numbered default name', () => {
    const { jd } = parseJd('我们希望有个伙伴\n一起做点事情', CTX, createIdSeed())
    expect(jd.roleName).toBe('版本 1')
    expect(jd.roleNameSource).toBe('fallback')
  })

  it('numbers the fallback name after the existing versions', () => {
    const { jd } = parseJd('我们希望有个伙伴\n一起做点事情', CTX, createIdSeed(), 3)
    expect(jd.roleName).toBe('版本 4')
  })

  it('collects the duty lines and the requirement lines', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const texts = jd.requirements.map((requirement) => requirement.text)
    expect(texts).toContain('负责公司中台业务系统的前端开发与维护')
    expect(texts).toContain('参与前端基础设施建设')
    expect(texts).toContain('精通 Vue 和 TypeScript')
    expect(texts).toContain('熟悉 Docker 与 CI/CD 流程')
  })

  it('drops the boilerplate lines', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const texts = jd.requirements.map((requirement) => requirement.text)
    expect(texts).not.toContain('五险一金')
    expect(texts).not.toContain('补充商业保险')
  })

  it('drops the section headers', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const texts = jd.requirements.map((requirement) => requirement.text)
    expect(texts).not.toContain('岗位职责：')
    expect(texts).not.toContain('任职要求：')
  })

  it('keeps a requirement sentence unchanged', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const requirement = jd.requirements.find((item) => item.text.includes('Docker'))
    expect(requirement!.text).toBe('熟悉 Docker 与 CI/CD 流程')
  })

  it('merges duplicated requirements', () => {
    const { jd } = parseJd(
      '任职要求：\n1. 精通 Vue 和 TypeScript\n2. 精通 Vue 和 TypeScript',
      CTX,
      createIdSeed(),
    )
    expect(jd.requirements).toHaveLength(1)
  })

  it('drops a requirement that carries a forbidden word', () => {
    const { jd } = parseJd(
      '任职要求：\n1. 精通 Vue\n2. 有面试其他开发者的经验',
      CTX,
      createIdSeed(),
    )
    const texts = jd.requirements.map((requirement) => requirement.text)
    expect(texts).toContain('精通 Vue')
    expect(texts).not.toContain('有面试其他开发者的经验')
  })

  it('collects the catalog keywords of a requirement', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const requirement = jd.requirements.find((item) => item.text.includes('Docker'))
    expect(requirement!.keywords).toContain('Docker')
  })

  it('gives every requirement an identifier', () => {
    const { jd } = parseJd(JD, CTX, createIdSeed())
    const ids = jd.requirements.map((requirement) => requirement.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('extractCorePhrases', () => {
  it('returns the meaningful phrases of a requirement', () => {
    expect(extractCorePhrases('熟悉 Node.js 服务端开发')).toContain('Node.js')
  })

  it('removes the requirement wording', () => {
    expect(extractCorePhrases('熟悉 Node.js 服务端开发')).not.toContain('熟悉')
  })

  it('returns an empty list when nothing meaningful is left', () => {
    expect(extractCorePhrases('熟悉')).toEqual([])
  })
})
