import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadLocalEnv } from './env'

const KEY = 'XIAOYI_ENV_SPEC_PROBE'

const touched: string[] = []

function tempDirWithEnv(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'xiaoyi-env-'))
  writeFileSync(join(dir, '.env'), content)
  return dir
}

afterEach(() => {
  for (const key of touched) delete process.env[key]
  touched.length = 0
})

describe('读取本地的环境变量文件', () => {
  it('文件在时读得到里面的值', () => {
    const dir = tempDirWithEnv(`${KEY}=from_file\n`)
    touched.push(KEY)

    expect(loadLocalEnv(dir)).toBe(true)
    expect(process.env[KEY]).toBe('from_file')

    rmSync(dir, { recursive: true, force: true })
  })

  it('进程环境里已有的同名变量不被文件覆盖', () => {
    process.env[KEY] = 'from_process'
    touched.push(KEY)
    const dir = tempDirWithEnv(`${KEY}=from_file\n`)

    expect(loadLocalEnv(dir)).toBe(true)
    expect(process.env[KEY]).toBe('from_process')

    rmSync(dir, { recursive: true, force: true })
  })

  it('文件不在时不算出错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xiaoyi-env-'))

    expect(loadLocalEnv(dir)).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })
})
