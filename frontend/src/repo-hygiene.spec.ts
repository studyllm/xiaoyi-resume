import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
        return name === '.env' || name.startsWith('.env.')
      })
    expect(offenders).toEqual([])
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
