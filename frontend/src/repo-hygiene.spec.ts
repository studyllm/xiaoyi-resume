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
