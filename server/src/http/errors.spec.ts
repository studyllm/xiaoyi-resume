import { describe, expect, it } from 'vitest'

import { describeMissingSchema } from './errors'

/** Drizzle 的查询错误：原始的 PG 错误在 cause 上。 */
function queryError(code: string): Error {
  return Object.assign(new Error('Failed query: select "id" from "users"'), {
    cause: Object.assign(new Error('列或表不存在'), { code }),
  })
}

describe('数据库缺表缺列时的提示', () => {
  it('列不存在时给出可操作的下一步', () => {
    const hint = describeMissingSchema(queryError('42703'))
    expect(hint).toContain('npm run db:migrate')
  })

  it('表不存在时同样给提示', () => {
    expect(describeMissingSchema(queryError('42P01'))).toContain('npm run db:migrate')
  })

  it('别的错误不乱套提示', () => {
    expect(describeMissingSchema(new Error('connect ECONNREFUSED'))).toBeNull()
    expect(describeMissingSchema(null)).toBeNull()
    expect(describeMissingSchema('随便什么')).toBeNull()
  })
})
