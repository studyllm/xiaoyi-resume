import { describe, expect, it } from 'vitest'

import {
  containsLatinWord,
  containsTerm,
  isLatinTerm,
  normalizeText,
  similarity,
  stripPunctuation,
  toHalfWidth,
  tokenize,
} from './textUtils'

describe('toHalfWidth', () => {
  it('converts full width letters and digits', () => {
    expect(toHalfWidth('ＡＢＣ１２３')).toBe('ABC123')
  })

  it('converts the ideographic space into a normal space', () => {
    expect(toHalfWidth('a　b')).toBe('a b')
  })
})

describe('stripPunctuation', () => {
  it('removes chinese and latin punctuation', () => {
    expect(stripPunctuation('负责 Vue 开发。')).toBe('负责 Vue 开发')
  })

  it('keeps inner spaces', () => {
    expect(stripPunctuation('a b')).toBe('a b')
  })

  it('removes a chinese comma without leaving a gap', () => {
    expect(stripPunctuation('a，b')).toBe('ab')
  })
})

describe('normalizeText', () => {
  it('lowercases, removes punctuation and removes spaces', () => {
    expect(normalizeText('负责  Vue  开发。')).toBe('负责vue开发')
  })

  it('folds full width characters into half width', () => {
    expect(normalizeText('ＶＵＥ')).toBe('vue')
  })
})

describe('tokenize', () => {
  it('splits latin words and chinese bigrams', () => {
    expect(tokenize('使用 Vue 和 React')).toEqual(['使用', 'vue', '和', 'react'])
  })

  it('returns an empty list for empty input', () => {
    expect(tokenize('')).toEqual([])
  })
})

describe('isLatinTerm', () => {
  it('recognises a latin term', () => {
    expect(isLatinTerm('Vue')).toBe(true)
  })

  it('recognises a chinese term', () => {
    expect(isLatinTerm('高并发')).toBe(false)
  })
})

describe('containsLatinWord', () => {
  it('does not match a latin term inside a longer word', () => {
    expect(containsLatinWord('使用 Google 搜索', 'Go')).toBe(false)
  })

  it('matches a latin term on its own', () => {
    expect(containsLatinWord('使用 Go 语言', 'Go')).toBe(true)
  })

  it('does not match a latin term followed by a digit', () => {
    expect(containsLatinWord('熟悉 Vue3 生态', 'Vue')).toBe(false)
  })

  it('matches a latin term followed by a space', () => {
    expect(containsLatinWord('熟悉 Vue 生态', 'Vue')).toBe(true)
  })

  it('matches regardless of case', () => {
    expect(containsLatinWord('熟练 vue', 'Vue')).toBe(true)
  })
})

describe('containsTerm', () => {
  it('uses word boundaries for latin terms', () => {
    expect(containsTerm('负责 Vue3 开发', 'Vue')).toBe(false)
  })

  it('uses substring matching for chinese terms', () => {
    expect(containsTerm('负责高并发服务开发', '高并发')).toBe(true)
  })
})

describe('similarity', () => {
  it('returns one for identical strings', () => {
    expect(similarity('负责 Vue 开发', '负责 Vue 开发')).toBe(1)
  })

  it('returns zero for unrelated strings', () => {
    expect(similarity('负责 Vue 开发', '今天天气不错')).toBe(0)
  })

  it('returns a value above zero for partially overlapping strings', () => {
    expect(similarity('负责 Vue 开发', '使用 Vue 组件开发')).toBeGreaterThan(0)
  })

  it('stays within the zero to one range', () => {
    expect(similarity('负责 Vue 开发', '负责 Java 开发')).toBeLessThanOrEqual(1)
  })
})
