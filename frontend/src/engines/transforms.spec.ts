import { describe, expect, it } from 'vitest'

import { applyTransforms, assertNoFactsAdded, FORBIDDEN_TRANSFORMS } from './transforms'

describe('applyTransforms', () => {
  it('removes a leading bullet marker', () => {
    expect(applyTransforms('· 负责组件库开发')).toBe('负责组件库开发')
  })

  it('normalises the case of a catalog technology', () => {
    expect(applyTransforms('使用vue和react开发')).toBe('使用 Vue 和 React 开发')
  })

  it('normalises full width characters into half width', () => {
    expect(applyTransforms('使用ＶＵＥ开发')).toBe('使用 Vue 开发')
  })

  it('adds a space between chinese and latin text', () => {
    expect(applyTransforms('使用vue开发')).toBe('使用 Vue 开发')
  })

  it('removes a leading connective adverbial', () => {
    expect(applyTransforms('在此期间，推动了组件库建设')).toBe('推动了组件库建设')
  })

  it('removes a leading conjunction', () => {
    expect(applyTransforms('同时，推动了组件库建设')).toBe('推动了组件库建设')
  })

  it('moves the verb to the front', () => {
    expect(applyTransforms('负责组件库的开发')).toBe('开发组件库')
  })

  it('keeps the verb in place when the sentence carries a collaboration marker', () => {
    expect(applyTransforms('负责组件库的开发，配合设计完成')).toBe(
      '负责组件库的开发，配合设计完成',
    )
  })

  it('keeps the verb in place when the option is off', () => {
    expect(applyTransforms('负责组件库的开发', { allowVerbFronting: false })).toBe(
      '负责组件库的开发',
    )
  })

  it('removes the trailing punctuation', () => {
    expect(applyTransforms('负责组件库开发。')).toBe('负责组件库开发')
  })

  it('leaves a sentence without any transformation untouched', () => {
    expect(applyTransforms('负责组件库开发')).toBe('负责组件库开发')
  })
})

describe('assertNoFactsAdded', () => {
  it('passes when the output equals the source', () => {
    expect(assertNoFactsAdded('负责 Vue 开发', '负责 Vue 开发')).toEqual([])
  })

  it('passes when only the layout changed', () => {
    expect(assertNoFactsAdded('· 负责 vue 开发。', '负责 Vue 开发')).toEqual([])
  })

  it('reports a number that is absent from the source', () => {
    expect(assertNoFactsAdded('负责组件库开发', '负责组件库开发，覆盖 30 个业务线').length).toBeGreaterThan(0)
  })

  it('reports a latin word that is absent from the source', () => {
    expect(assertNoFactsAdded('负责组件库开发', '负责 React 开发').length).toBeGreaterThan(0)
  })

  it('reports a chinese character that is absent from the source', () => {
    expect(assertNoFactsAdded('负责组件库开发', '负责组件库平台开发').length).toBeGreaterThan(0)
  })

  it('reports a verb whose strength was raised', () => {
    expect(assertNoFactsAdded('参与组件库开发', '主导组件库开发').length).toBeGreaterThan(0)
  })

  it('reports a rating that was raised', () => {
    expect(assertNoFactsAdded('熟悉 Vue 开发', '精通 Vue 开发').length).toBeGreaterThan(0)
  })

  it('reports a sentence that grew beyond the allowed margin', () => {
    expect(assertNoFactsAdded('负责开发', '负责开发甲乙丙丁戊己庚辛壬癸').length).toBeGreaterThan(0)
  })

  it('accepts a latin word that comes from the entry metadata', () => {
    expect(
      assertNoFactsAdded('负责开发', '负责 Element 开发', { metadata: '美团 Element 组件库' }),
    ).toEqual([])
  })

  it('reports a number whose precision changed', () => {
    expect(assertNoFactsAdded('耗时 3.5 小时', '耗时 3.75 小时').length).toBeGreaterThan(0)
  })
})

describe('FORBIDDEN_TRANSFORMS', () => {
  it('declares the transformations the engine must never perform', () => {
    const ids = FORBIDDEN_TRANSFORMS.map((transform) => transform.id)
    expect(ids).toContain('verb-strength-up')
    expect(ids).toContain('verb-strength-down')
    expect(ids).toContain('new-number')
    expect(ids).toContain('new-entity')
    expect(ids).toContain('new-responsibility')
    expect(ids).toContain('time-change')
    expect(ids).toContain('causal-stitching')
    expect(ids).toContain('keyword-injection')
    expect(ids).toContain('rating-up')
    expect(ids).toContain('number-precision-change')
  })
})
