import { describe, expect, it } from 'vitest'

import { DEFAULT_PRODUCT_NAME, documentTitle, resolveProductName } from './productName'

describe('产品名', () => {
  it('没配、留空或只有空白时用默认名', () => {
    expect(resolveProductName(undefined)).toBe(DEFAULT_PRODUCT_NAME)
    expect(resolveProductName('')).toBe(DEFAULT_PRODUCT_NAME)
    expect(resolveProductName('   ')).toBe(DEFAULT_PRODUCT_NAME)
  })

  it('配了就用去掉首尾空白后的名字', () => {
    expect(resolveProductName('  星河简历  ')).toBe('星河简历')
  })

  it('浏览器标题用产品名，并保留演示说明', () => {
    expect(documentTitle('星河简历')).toBe('星河简历（原型演示）')
    expect(documentTitle(DEFAULT_PRODUCT_NAME)).toBe('小奕·简历（原型演示）')
  })
})
