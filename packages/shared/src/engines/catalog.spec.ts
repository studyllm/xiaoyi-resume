import { describe, expect, it } from 'vitest'

import { CATALOG, matchCatalog } from './catalog'

describe('matchCatalog', () => {
  it('matches a latin alias standing on its own', () => {
    const hits = matchCatalog('熟悉 Vue 生态')
    expect(hits.some((hit) => hit.entry.id === 'vue' && hit.kind === 'alias')).toBe(true)
  })

  it('does not match a latin alias inside a longer word', () => {
    const hits = matchCatalog('使用 Google 搜索')
    expect(hits.some((hit) => hit.entry.id === 'go')).toBe(false)
  })

  it('does not match a latin alias followed by a letter', () => {
    const hits = matchCatalog('使用 TSDB 存储')
    expect(hits.some((hit) => hit.entry.id === 'typescript')).toBe(false)
  })

  it('prefers the longest term and masks the shorter one', () => {
    const hits = matchCatalog('使用 Vue.js 开发')
    const vueHits = hits.filter((hit) => hit.entry.id === 'vue')
    expect(vueHits).toHaveLength(1)
    expect(vueHits[0]!.term).toBe('Vue.js')
  })

  it('matches a chinese term as a substring', () => {
    const hits = matchCatalog('负责高并发服务')
    expect(hits.some((hit) => hit.entry.id === 'high-concurrency')).toBe(true)
  })

  it('does not report a related term hidden inside a longer alias', () => {
    const hits = matchCatalog('推动容器化改造')
    expect(hits.some((hit) => hit.entry.id === 'containerization' && hit.kind === 'related')).toBe(
      false,
    )
  })

  it('reports a related term standing on its own', () => {
    const hits = matchCatalog('熟悉容器技术')
    expect(hits.some((hit) => hit.entry.id === 'docker' && hit.kind === 'related')).toBe(true)
  })

  it('returns matches ordered by position in the text', () => {
    const hits = matchCatalog('使用 Vue 与 React')
    const positions = hits.map((hit) => hit.start)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  it('covers every category the catalog declares', () => {
    const categories = new Set(CATALOG.map((entry) => entry.category))
    expect(categories).toContain('frontend')
    expect(categories).toContain('backend')
    expect(categories).toContain('data')
    expect(categories).toContain('infra')
    expect(categories).toContain('architecture')
    expect(categories).toContain('engineering')
    expect(categories).toContain('soft')
    expect(categories).toContain('language')
    expect(categories).toContain('domain')
  })

  it('gives every entry a unique identifier', () => {
    const ids = CATALOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
