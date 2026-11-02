import { describe, expect, it } from 'vitest'

import type { Draft } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
import { addSkillRow, applyOp, isEmptyItem } from './editing'

function makeDraft(): Draft {
  return {
    id: 'draft-1',
    userId: 'user-1',
    revision: 1,
    profile: { name: '张三', headline: '', contacts: [{ label: '手机', value: '138' }] },
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: SECTION_ORDER.map((kind) => ({
      id: `sec-${kind}`,
      kind,
      title: SECTION_TITLES[kind],
      items:
        kind === 'experience'
          ? [
              {
                id: 'item-1',
                org: '美团',
                title: '前端工程师',
                start: '2021-03',
                end: null,
                present: true,
                bullets: [
                  { id: 'b1', text: '主导活动平台前端架构升级' },
                  { id: 'b2', text: '负责日常维护' },
                ],
              },
            ]
          : kind === 'skills'
            ? [{ id: 'skill-item', bullets: [{ id: 's1', text: 'Vue' }] }]
            : [],
    })),
  }
}

function experienceOf(draft: Draft) {
  return draft.sections.find((section) => section.kind === 'experience')!
}

describe('applyOp', () => {
  it('does not change the draft it is given', () => {
    const draft = makeDraft()
    const snapshot = JSON.stringify(draft)
    applyOp(draft, {
      type: 'set-bullet-text',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      bulletId: 'b1',
      text: '改过的要点',
    })
    expect(JSON.stringify(draft)).toBe(snapshot)
  })

  it('changes the text of a bullet', () => {
    const next = applyOp(makeDraft(), {
      type: 'set-bullet-text',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      bulletId: 'b1',
      text: '改过的要点',
    })
    expect(experienceOf(next).items[0]!.bullets[0]!.text).toBe('改过的要点')
  })

  it('adds a bullet with the given identifier', () => {
    const next = applyOp(makeDraft(), {
      type: 'add-bullet',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      bulletId: 'b3',
    })
    expect(experienceOf(next).items[0]!.bullets.map((bullet) => bullet.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('removes a bullet', () => {
    const next = applyOp(makeDraft(), {
      type: 'remove-bullet',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      bulletId: 'b1',
    })
    expect(experienceOf(next).items[0]!.bullets.map((bullet) => bullet.id)).toEqual(['b2'])
  })

  it('removes an entry that only had an empty bullet', () => {
    // 一个还没填任何字段的条目，删掉它唯一那条要点之后就不该留下空壳
    const withItem = applyOp(makeDraft(), {
      type: 'add-item',
      sectionId: 'sec-project',
      itemId: 'item-empty',
    })
    const withBullet = applyOp(withItem, {
      type: 'add-bullet',
      sectionId: 'sec-project',
      itemId: 'item-empty',
      bulletId: 'pb1',
    })
    const next = applyOp(withBullet, {
      type: 'remove-bullet',
      sectionId: 'sec-project',
      itemId: 'item-empty',
      bulletId: 'pb1',
    })
    expect(next.sections.find((section) => section.kind === 'project')!.items).toHaveLength(0)
  })

  it('keeps an entry that still has fields after its last bullet is removed', () => {
    const next = applyOp(makeDraft(), {
      type: 'remove-bullet',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      bulletId: 'b2',
    })
    expect(experienceOf(next).items).toHaveLength(1)
    expect(experienceOf(next).items[0]!.bullets.map((bullet) => bullet.id)).toEqual(['b1'])
  })

  it('adds and removes an entry', () => {
    const added = applyOp(makeDraft(), {
      type: 'add-item',
      sectionId: 'sec-project',
      itemId: 'item-new',
    })
    expect(added.sections.find((section) => section.kind === 'project')!.items).toHaveLength(1)

    const removed = applyOp(added, {
      type: 'remove-item',
      sectionId: 'sec-project',
      itemId: 'item-new',
    })
    expect(removed.sections.find((section) => section.kind === 'project')!.items).toHaveLength(0)
  })

  it('changes the meta of an entry', () => {
    const next = applyOp(makeDraft(), {
      type: 'set-item-meta',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      patch: { title: '高级前端工程师', present: false },
    })
    const item = experienceOf(next).items[0]!
    expect(item.title).toBe('高级前端工程师')
    expect(item.present).toBe(false)
  })

  it('changes the profile', () => {
    const next = applyOp(makeDraft(), { type: 'set-profile', patch: { name: '李四' } })
    expect(next.profile.name).toBe('李四')
  })

  it('adds and removes a contact', () => {
    const added = applyOp(makeDraft(), {
      type: 'add-contact',
      contact: { label: '邮箱', value: 'a@example.com' },
    })
    expect(added.profile.contacts).toHaveLength(2)

    const removed = applyOp(added, { type: 'remove-contact', index: 0 })
    expect(removed.profile.contacts[0]!.label).toBe('邮箱')
  })

  it('does nothing when the target is gone', () => {
    const next = applyOp(makeDraft(), {
      type: 'set-bullet-text',
      sectionId: 'sec-experience',
      itemId: 'item-1',
      bulletId: 'nope',
      text: '改过的要点',
    })
    expect(experienceOf(next).items[0]!.bullets[0]!.text).toBe('主导活动平台前端架构升级')
  })
})

describe('addSkillRow', () => {
  it('adds the skill to the existing skill entry', () => {
    const next = addSkillRow(makeDraft(), {
      sectionId: 'sec-skills',
      itemId: 'skill-item',
      bulletId: 's2',
    })
    const skills = next.sections.find((section) => section.kind === 'skills')!
    expect(skills.items).toHaveLength(1)
    expect(skills.items[0]!.bullets.map((bullet) => bullet.id)).toEqual(['s1', 's2'])
  })

  it('creates the skill entry when the section has none', () => {
    const draft = makeDraft()
    draft.sections.find((section) => section.kind === 'skills')!.items = []
    const next = addSkillRow(draft, {
      sectionId: 'sec-skills',
      itemId: 'skill-item-new',
      bulletId: 's1',
    })
    const skills = next.sections.find((section) => section.kind === 'skills')!
    expect(skills.items).toHaveLength(1)
    expect(skills.items[0]!.bullets.map((bullet) => bullet.id)).toEqual(['s1'])
  })
})

describe('isEmptyItem', () => {
  it('treats an entry without fields and without bullets as empty', () => {
    expect(isEmptyItem({ id: 'x', bullets: [] })).toBe(true)
    expect(isEmptyItem({ id: 'x', org: '美团', bullets: [] })).toBe(false)
    expect(isEmptyItem({ id: 'x', bullets: [{ id: 'b', text: '做过事' }] })).toBe(false)
  })

  it('treats a bullet that only has whitespace as empty', () => {
    expect(isEmptyItem({ id: 'x', bullets: [{ id: 'b', text: '  ' }] })).toBe(true)
  })
})
