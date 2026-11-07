import { describe, expect, it } from 'vitest'

import {
  FORBIDDEN_WORDS,
  assertCleanOutput,
  findForbiddenWords,
  isCleanOutput,
  maskForbiddenWords,
} from './forbidden'

describe('findForbiddenWords', () => {
  it('finds a forbidden word', () => {
    expect(findForbiddenWords('这场面试会问很多')).toEqual(['面试'])
  })

  it('finds several forbidden words', () => {
    expect(findForbiddenWords('题库与刷题')).toEqual(expect.arrayContaining(['题库', '刷题']))
  })

  it('returns an empty list for clean text', () => {
    expect(findForbiddenWords('负责 Vue 组件开发')).toEqual([])
  })

  it('covers the whole forbidden word list', () => {
    for (const word of FORBIDDEN_WORDS) {
      expect(findForbiddenWords(`包含${word}的文本`)).toContain(word)
    }
  })
})

describe('assertCleanOutput', () => {
  it('throws when the text carries a forbidden word', () => {
    expect(() => assertCleanOutput('准备面试')).toThrow()
  })

  it('does not throw for clean text', () => {
    expect(() => assertCleanOutput('负责 Vue 组件开发')).not.toThrow()
  })

  it('mentions the offending word in the error message', () => {
    expect(() => assertCleanOutput('准备面试')).toThrow(/面试/)
  })
})

describe('isCleanOutput', () => {
  it('reports clean text', () => {
    expect(isCleanOutput('负责 Vue 组件开发')).toBe(true)
  })

  it('reports dirty text', () => {
    expect(isCleanOutput('准备刷题')).toBe(false)
  })
})

describe('maskForbiddenWords', () => {
  it('replaces the forbidden word with a mask', () => {
    expect(maskForbiddenWords('准备面试')).toBe('准备**')
  })

  it('leaves clean text untouched', () => {
    expect(maskForbiddenWords('负责 Vue 组件开发')).toBe('负责 Vue 组件开发')
  })
})
