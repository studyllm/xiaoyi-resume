import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { findForbiddenWords } from '@xiaoyi/shared/engines/forbidden'

// 本文件在 frontend/src/ 下，仓库根在其上两层
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const skippedDirs = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite'])

function walk(root: string, onDir: (full: string) => void): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || skippedDirs.has(entry.name)) continue
    const full = join(root, entry.name)
    onDir(full)
    walk(full, onDir)
  }
}

function dirsNamed(root: string, name: string): string[] {
  const found: string[] = []
  walk(root, (full) => {
    if (basename(full) === name) found.push(full)
  })
  return found
}

function filesUnder(root: string): string[] {
  const found: string[] = []
  const collect = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skippedDirs.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (entry.isFile()) found.push(full)
    }
  }
  collect(root)
  return found
}

/**
 * 这个文件会不会被提交。
 *
 * 判断依据是 git 的忽略规则：被忽略的文件进不了仓库，不构成风险。
 * 本地开发要在 `server/.env` 里放服务端的配置——那份文件被忽略，
 * 守卫不该拦它。规格说的是「不入库」，不是「磁盘上不能存在」。
 *
 * 拿不到 git 的判断时（不在仓库里、git 不可用）按会被提交处理——保守。
 */
function wouldBeCommitted(file: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', file], { cwd: repoRoot, stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

describe('仓库结构', () => {
  it('没有嵌套在别处的源码目录', () => {
    const nested = dirsNamed(repoRoot, 'src').filter((dir) => {
      const segments = relative(repoRoot, dir).split('/')
      return segments.filter((part) => part === 'src').length > 1
    })
    expect(nested.map((dir) => relative(repoRoot, dir))).toEqual([])
  })

  it('没有环境变量文件，只有只含键名的样例', () => {
    const offenders = filesUnder(repoRoot)
      .map((file) => relative(repoRoot, file))
      .filter((rel) => {
        const name = basename(rel)
        if (name === '.env.example') return false
        if (name !== '.env' && !name.startsWith('.env.')) return false
        // 被 git 忽略的进不了仓库，不算问题
        return wouldBeCommitted(join(repoRoot, rel))
      })
    expect(offenders).toEqual([])
  })

  it('被忽略的环境变量文件不算会被提交', () => {
    expect(wouldBeCommitted(join(repoRoot, 'server/.env'))).toBe(false)
    expect(wouldBeCommitted(join(repoRoot, 'server/.env.local'))).toBe(false)
  })

  it('没被忽略的文件会被提交', () => {
    expect(wouldBeCommitted(join(repoRoot, 'docs/notes.env'))).toBe(true)
  })

  it('忽略规则排除了环境变量文件，只放行样例', () => {
    const rules = readFileSync(join(repoRoot, '.gitignore'), 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    expect(rules).toContain('.env')
    expect(rules).toContain('!.env.example')
  })

  it('忽略规则排除了本机私有配置', () => {
    const rules = readFileSync(join(repoRoot, '.gitignore'), 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    expect(rules).toContain('.claude/settings.local.json')
    expect(rules).toContain('.DS_Store')
  })
})

describe('生效规格', () => {
  const specsDir = join(repoRoot, 'openspec/specs')

  function specFiles(): string[] {
    return readdirSync(specsDir)
      .map((name) => join(specsDir, name, 'spec.md'))
      .filter((file) => existsSync(file))
  }

  it('每份规格都写明了目的，不留占位符', () => {
    const problems: string[] = []
    for (const file of specFiles()) {
      const name = basename(dirname(file))
      const text = readFileSync(file, 'utf-8')
      if (text.includes('TBD - created by archiving')) {
        problems.push(`${name}：目的说明仍是归档占位符`)
      }
      const purpose = text.match(/##\s*Purpose\s*\n+([\s\S]*?)(?=\n##\s|$)/)
      if (!purpose || !purpose[1].trim()) {
        problems.push(`${name}：缺少非空的目的说明段`)
      }
    }
    expect(problems).toEqual([])
  })

  it('每份规格都有需求与场景', () => {
    const problems: string[] = []
    for (const file of specFiles()) {
      const name = basename(dirname(file))
      const text = readFileSync(file, 'utf-8')
      if (!/^### Requirement: /m.test(text)) problems.push(`${name}：没有需求条目`)
      if (!/^#### Scenario: /m.test(text)) problems.push(`${name}：没有场景条目`)
    }
    expect(problems).toEqual([])
  })
})

describe('对外说明', () => {
  // README 是仓库的公开落地页，是产品最对外的一层，不能出现被排除方向的内容。
  // docs/ 下的内部文档不在此列——它们本来就要写清楚「哪些方向不做」。
  it('README 不出现禁用词', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8')
    expect(findForbiddenWords(readme)).toEqual([])
  })

  it('README 用的是界面用词，不是内部术语', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8')
    expect(readme).not.toContain('底稿')
  })
})

describe('开发流程的关卡', () => {
  // AGENTS.md §2.0：需求澄清与系统设计是强制关卡。
  // 这个守卫让「强制」不靠自觉——每个活跃变更都要说清自己走了哪一关，
  // 而且填的路径得真实存在。填了不存在的路径等于没走那一关。
  const changesDir = join(repoRoot, 'openspec/changes')
  const clarificationsDir = join(repoRoot, 'docs/clarifications')
  const designsDir = join(repoRoot, 'docs/designs')

  /** 活跃变更 = 不在 archive 下的变更目录。归档的变更不再受关卡约束。 */
  function activeChanges(): string[] {
    if (!existsSync(changesDir)) return []
    return readdirSync(changesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
      .map((entry) => entry.name)
  }

  /** 从 proposal.md 里取「- 标签：值」这一行。 */
  function fieldOf(text: string, label: string): string | null {
    const match = text.match(new RegExp(`^\\s*[-*]\\s*${label}：\\s*(.+?)\\s*$`, 'm'))
    return match ? match[1]! : null
  }

  /** 变更是不是 bug 流程——目录名以 fix- 开头。 */
  function isBugFlow(change: string): boolean {
    return change.startsWith('fix-')
  }

  /** 填的路径必须真实存在，且落在该放的目录里。 */
  function resolves(reference: string, expectedDir: string): boolean {
    if (!reference.startsWith(expectedDir)) return false
    return existsSync(join(repoRoot, reference))
  }

  it('每个活跃变更都在 proposal.md 里写清重量、澄清文档与系统设计', () => {
    const problems: string[] = []
    for (const change of activeChanges()) {
      const proposalFile = join(changesDir, change, 'proposal.md')
      if (!existsSync(proposalFile)) continue
      const text = readFileSync(proposalFile, 'utf-8')

      const weight = fieldOf(text, '重量')
      if (weight === null) {
        problems.push(`${change}：proposal.md 没有写「- 重量：重 | 轻」`)
      } else if (weight !== '重' && weight !== '轻') {
        problems.push(`${change}：重量只能是「重」或「轻」，实际是「${weight}」`)
      }

      const clarification = fieldOf(text, '澄清文档')
      if (clarification === null) {
        problems.push(`${change}：proposal.md 没有写「- 澄清文档：…」`)
      } else if (isBugFlow(change)) {
        // bug 流程豁免澄清，但豁免得说出口。
        if (clarification !== '无（bug 流程）') {
          problems.push(`${change}：bug 流程的澄清文档应写「无（bug 流程）」`)
        }
      } else if (!resolves(clarification, 'docs/clarifications/')) {
        problems.push(`${change}：澄清文档「${clarification}」不是 docs/clarifications/ 下真实存在的文件`)
      }

      const design = fieldOf(text, '系统设计')
      if (design === null) {
        problems.push(`${change}：proposal.md 没有写「- 系统设计：…」`)
      } else if (isBugFlow(change)) {
        if (design !== '无（bug 流程）') {
          problems.push(`${change}：bug 流程的系统设计应写「无（bug 流程）」`)
        }
      } else if (weight === '重') {
        if (!resolves(design, 'docs/designs/')) {
          problems.push(`${change}：重量为「重」但系统设计「${design}」不是 docs/designs/ 下真实存在的文件`)
        }
      } else if (design !== '无（轻变更）') {
        problems.push(`${change}：重量为「轻」时系统设计应写「无（轻变更）」`)
      }
    }
    expect(problems).toEqual([])
  })

  it('澄清文档的七段齐全', () => {
    if (!existsSync(clarificationsDir)) return
    const problems: string[] = []
    for (const name of readdirSync(clarificationsDir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(clarificationsDir, name), 'utf-8')
      for (const section of ['作用', '解决什么问题', '功能范围', '影响', '实现难度', '是否有必要实现', '对用户的帮助']) {
        if (!new RegExp(`^##\\s*\\d*\\.?\\s*${section}`, 'm').test(text)) {
          problems.push(`${name}：缺少「${section}」这一段`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('系统设计文档的七维齐全', () => {
    if (!existsSync(designsDir)) return
    const problems: string[] = []
    for (const name of readdirSync(designsDir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(designsDir, name), 'utf-8')
      for (const section of [
        '架构设计',
        'UI 设计',
        '前端设计',
        '后端设计',
        '数据库设计',
        '测试设计',
        '开发任务拆分',
      ]) {
        if (!new RegExp(`^##\\s*\\d*\\.?\\s*${section}`, 'm').test(text)) {
          problems.push(`${name}：缺少「${section}」这一段`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
