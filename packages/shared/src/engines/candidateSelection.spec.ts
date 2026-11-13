import { describe, expect, it } from 'vitest'

import type { BulletEvidence } from './coverage'
import { DEFAULT_MAX_CANDIDATES, selectCandidates } from './candidateSelection'

/** 一条要点证据。相关度与「与岗位相关」是分开给的——这里要能分别测。 */
function evidenceOf(input: {
  bulletId: string
  itemId: string
  draftIndex: number
  relevance: number
  jdRelated: boolean
}): BulletEvidence {
  return {
    bulletId: input.bulletId,
    text: `要点 ${input.bulletId}`,
    sectionId: 'sec-1',
    sectionKind: 'experience',
    itemId: input.itemId,
    draftIndex: input.draftIndex,
    relevance: input.relevance,
    hasResult: false,
    planned: false,
    exactTerms: new Set(),
    relatedByEntry: new Map(),
    approxRequirements: new Set(),
    jdRelated: input.jdRelated,
  }
}

describe('候选要点怎么挑', () => {
  it('与岗位无关的要点不进候选集', () => {
    const selection = selectCandidates([
      evidenceOf({ bulletId: 'b1', itemId: 'i1', draftIndex: 0, relevance: 9, jdRelated: true }),
      evidenceOf({ bulletId: 'b2', itemId: 'i2', draftIndex: 1, relevance: 7, jdRelated: true }),
      // 第 3 条与岗位无关，但它的条目里也没有别的相关要点——保底留它
      evidenceOf({ bulletId: 'b3', itemId: 'i3', draftIndex: 2, relevance: 0, jdRelated: false }),
    ])

    expect(selection.candidates.map((entry) => entry.bulletId)).toEqual(['b1', 'b2', 'b3'])
    expect(selection.floors.map((floor) => floor.bulletId)).toEqual(['b3'])
  })

  it('每个条目至少留一条要点', () => {
    const selection = selectCandidates([
      evidenceOf({ bulletId: 'b1', itemId: 'i1', draftIndex: 0, relevance: 9, jdRelated: true }),
      // 第二个条目与岗位完全无关——但模型至少要知道有这么个条目
      evidenceOf({ bulletId: 'b2', itemId: 'i2', draftIndex: 1, relevance: 0, jdRelated: false }),
    ])

    expect(selection.candidates.map((entry) => entry.bulletId)).toEqual(['b1', 'b2'])
    expect(selection.floors.map((floor) => floor.bulletId)).toEqual(['b2'])
    expect(selection.floors[0]!.reason).toContain('与该岗位无关')
  })

  it('条目内留的是相关度最高的那条', () => {
    const selection = selectCandidates(
      [
        evidenceOf({ bulletId: 'b1', itemId: 'i1', draftIndex: 0, relevance: 3, jdRelated: true }),
        evidenceOf({ bulletId: 'b2', itemId: 'i1', draftIndex: 1, relevance: 8, jdRelated: true }),
      ],
      { maxCandidates: 1 },
    )

    // 名额不够时，相关度高的先占
    expect(selection.candidates.map((entry) => entry.bulletId)).toEqual(['b2'])
  })

  it('候选条数不超过上限', () => {
    const evidence = Array.from({ length: 60 }, (_, index) =>
      evidenceOf({
        bulletId: `b${index}`,
        itemId: `i${index}`,
        draftIndex: index,
        relevance: 60 - index,
        jdRelated: true,
      }),
    )

    const selection = selectCandidates(evidence, { maxCandidates: 40 })

    expect(selection.candidates).toHaveLength(40)
    // 名额按相关度从高到低给
    expect(selection.candidates[0]!.bulletId).toBe('b0')
  })

  it('条目数超过上限时只能放弃一部分条目的名额', () => {
    const evidence = Array.from({ length: 5 }, (_, index) =>
      evidenceOf({
        bulletId: `b${index}`,
        itemId: `i${index}`,
        draftIndex: index,
        relevance: 5 - index,
        jdRelated: false,
      }),
    )

    const selection = selectCandidates(evidence, { maxCandidates: 2 })

    expect(selection.candidates).toHaveLength(2)
    expect(selection.dropped.some((entry) => entry.reason.includes('条目数超过候选上限'))).toBe(true)
  })

  it('候选按简历里的先后排，编号因此会跳号', () => {
    const selection = selectCandidates([
      evidenceOf({ bulletId: 'b1', itemId: 'i1', draftIndex: 0, relevance: 9, jdRelated: true }),
      evidenceOf({ bulletId: 'b2', itemId: 'i1', draftIndex: 1, relevance: 3, jdRelated: false }),
      evidenceOf({ bulletId: 'b3', itemId: 'i2', draftIndex: 2, relevance: 7, jdRelated: true }),
    ])

    // 第 2 条与岗位无关且它的条目另有相关要点——它不进候选集，编号因此跳号
    expect(selection.candidates.map((entry) => entry.draftIndex)).toEqual([0, 2])
  })

  it('落选的要点说清为什么没参与比对', () => {
    const selection = selectCandidates([
      evidenceOf({ bulletId: 'b1', itemId: 'i1', draftIndex: 0, relevance: 9, jdRelated: true }),
      evidenceOf({ bulletId: 'b2', itemId: 'i1', draftIndex: 1, relevance: 1, jdRelated: false }),
    ])

    const dropped = selection.dropped.find((entry) => entry.bulletId === 'b2')
    expect(dropped).toBeDefined()
    expect(dropped!.reason).toContain('与该岗位无关')
  })

  it('默认上限是 40', () => {
    expect(DEFAULT_MAX_CANDIDATES).toBe(40)
  })
})
