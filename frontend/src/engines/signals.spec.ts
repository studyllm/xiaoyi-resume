import { describe, expect, it } from 'vitest'

import {
  findResponsibilityVerbs,
  findResultSignals,
  findVaguePhrases,
  hasResultSignal,
  hasTechnicalNoun,
} from './signals'

describe('findResponsibilityVerbs', () => {
  it('finds a responsibility verb', () => {
    expect(findResponsibilityVerbs('负责公司营销页面的前端开发')).toEqual(['负责', '开发'])
  })

  it('finds a participation verb', () => {
    expect(findResponsibilityVerbs('参与商家后台管理系统开发')).toEqual(['参与', '开发'])
  })

  it('ignores a verb that is part of a vague phrase', () => {
    expect(findResponsibilityVerbs('团队协作良好，认真负责，积极向上')).toEqual([])
  })

  it('ignores a verb that is part of a vague phrase about daily work', () => {
    expect(findResponsibilityVerbs('日常维护团队组件库')).toEqual([])
  })

  it('returns an empty list for a sentence without a responsibility verb', () => {
    expect(findResponsibilityVerbs('熟悉 Vue 与 ECharts 技术栈')).toEqual([])
  })

  it('treats a realisation verb as a responsibility verb', () => {
    expect(findResponsibilityVerbs('使用 Vue 与 ECharts 实现大屏')).toEqual(['实现'])
  })
})

describe('hasResultSignal', () => {
  it('detects a number', () => {
    expect(hasResultSignal('支撑 20+ 业务线接入')).toBe(true)
  })

  it('detects a percentage', () => {
    expect(hasResultSignal('首屏时间下降 35%')).toBe(true)
  })

  it('detects a before and after comparison', () => {
    expect(hasResultSignal('构建时间从 120s 降到 18s')).toBe(true)
  })

  it('detects a magnitude word', () => {
    expect(hasResultSignal('服务支撑百万级用户')).toBe(true)
  })

  it('detects an improvement word', () => {
    expect(hasResultSignal('整体效率显著提升')).toBe(true)
  })

  it('rejects a sentence with only a duty', () => {
    expect(hasResultSignal('负责日常需求开发')).toBe(false)
  })

  it('rejects a sentence whose only outcome word is a launch milestone', () => {
    expect(hasResultSignal('配合设计团队完成活动上线')).toBe(false)
  })

  it('rejects an empty sentence', () => {
    expect(hasResultSignal('')).toBe(false)
  })
})

describe('findResultSignals', () => {
  it('reports the signals it found', () => {
    expect(findResultSignals('页面构建时间从 120s 降到 18s').length).toBeGreaterThan(0)
  })

  it('reports nothing for a sentence without a signal', () => {
    expect(findResultSignals('负责日常需求开发')).toEqual([])
  })
})

describe('findVaguePhrases', () => {
  it('finds every vague phrase', () => {
    expect(findVaguePhrases('团队协作良好，认真负责，积极向上')).toEqual([
      '团队协作',
      '认真负责',
      '积极向上',
    ])
  })

  it('finds a vague phrase about daily work', () => {
    expect(findVaguePhrases('日常维护团队组件库')).toEqual(['日常维护'])
  })

  it('returns an empty list for a concrete sentence', () => {
    expect(findVaguePhrases('使用 Vue 3 重写编辑器内核')).toEqual([])
  })
})

describe('hasTechnicalNoun', () => {
  it('accepts a sentence naming a technology', () => {
    expect(hasTechnicalNoun('使用 Vue 与 ECharts 实现大屏')).toBe(true)
  })

  it('rejects a sentence with only generic wording', () => {
    expect(hasTechnicalNoun('日常维护团队组件库')).toBe(false)
  })

  it('rejects a sentence of pure praise', () => {
    expect(hasTechnicalNoun('团队协作良好，认真负责，积极向上')).toBe(false)
  })
})
