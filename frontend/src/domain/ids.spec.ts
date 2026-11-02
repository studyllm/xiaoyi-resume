import { describe, expect, it } from 'vitest'

import { createIdSeed, collectDraftIds, resumeIdSeed } from './ids'

describe('createIdSeed', () => {
  it('returns identifiers that increment per kind', () => {
    const seed = createIdSeed()
    expect(seed.next('bullet')).toBe('bullet-1')
    expect(seed.next('bullet')).toBe('bullet-2')
    expect(seed.next('item')).toBe('item-1')
  })

  it('produces different identifiers on every call', () => {
    const seed = createIdSeed()
    const ids = [seed.next('bullet'), seed.next('bullet'), seed.next('bullet')]
    expect(new Set(ids).size).toBe(3)
  })
})

describe('resumeIdSeed', () => {
  it('continues after the highest existing identifier', () => {
    const seed = resumeIdSeed(['bullet-1', 'bullet-2', 'item-7'])
    expect(seed.next('bullet')).toBe('bullet-3')
    expect(seed.next('item')).toBe('item-8')
  })

  it('ignores identifiers without a numeric suffix', () => {
    const seed = resumeIdSeed(['bullet', 'x-1'])
    expect(seed.next('bullet')).toBe('bullet-1')
  })
})

describe('collectDraftIds', () => {
  it('collects identifiers of every section, item and bullet', () => {
    const ids = collectDraftIds({
      id: 'draft-1',
      userId: 'user-1',
      revision: 1,
      profile: { name: '', headline: '', contacts: [] },
      updatedAt: '2026-01-01T00:00:00.000Z',
      sections: [
        {
          id: 'sec-1',
          kind: 'experience',
          title: '工作经历',
          items: [
            {
              id: 'item-1',
              bullets: [{ id: 'bullet-1', text: 'x' }],
            },
          ],
        },
      ],
    })
    expect(ids).toContain('sec-1')
    expect(ids).toContain('item-1')
    expect(ids).toContain('bullet-1')
  })
})
