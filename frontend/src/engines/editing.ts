import type { Bullet, Draft, DraftContact, DraftItem, DraftProfile } from '@/domain/types'

/**
 * 简历上的一次改动。界面只负责说清"用户做了什么"，
 * 简历应该变成什么样由 applyOp 说了算。
 *
 * 会新增对象的操作带上新对象的标识：由调用方给，
 * 这样这个函数不需要任何内部状态，标识也不会跟被删掉的撞上。
 */
export type DraftOp =
  | { type: 'set-profile'; patch: Partial<DraftProfile> }
  | { type: 'add-contact'; contact: DraftContact }
  | { type: 'remove-contact'; index: number }
  | {
      type: 'set-item-meta'
      sectionId: string
      itemId: string
      patch: Partial<Pick<DraftItem, 'org' | 'title' | 'start' | 'end' | 'present'>>
    }
  | { type: 'set-bullet-text'; sectionId: string; itemId: string; bulletId: string; text: string }
  | { type: 'add-bullet'; sectionId: string; itemId: string; bulletId: string }
  | { type: 'remove-bullet'; sectionId: string; itemId: string; bulletId: string }
  | { type: 'add-item'; sectionId: string; itemId: string }
  | { type: 'remove-item'; sectionId: string; itemId: string }

/** 条目上已经没有任何内容：没有字段，也没有要点。 */
export function isEmptyItem(item: DraftItem): boolean {
  const hasField = Boolean(item.org || item.title || item.start || item.end)
  const hasText = item.bullets.some((bullet) => bullet.text.trim())
  return !hasField && !hasText
}

function cloneDraft(source: Draft): Draft {
  return {
    ...source,
    profile: {
      ...source.profile,
      contacts: source.profile.contacts.map((contact) => ({ ...contact })),
    },
    sections: source.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        bullets: item.bullets.map((bullet) => ({ ...bullet })),
      })),
    })),
  }
}

function findSection(draft: Draft, sectionId: string) {
  return draft.sections.find((section) => section.id === sectionId)
}

function findItem(draft: Draft, sectionId: string, itemId: string): DraftItem | undefined {
  return findSection(draft, sectionId)?.items.find((item) => item.id === itemId)
}

/**
 * 算出改动之后的简历。返回新的对象，不改传入的那份。
 *
 * 简历规则收在这里，别处不再各写一遍：
 * 删掉最后一条要点后，条目空了就连带删掉。
 */
export function applyOp(draft: Draft, op: DraftOp): Draft {
  const next = cloneDraft(draft)

  switch (op.type) {
    case 'set-profile': {
      Object.assign(next.profile, op.patch)
      return next
    }

    case 'add-contact': {
      next.profile.contacts.push({ ...op.contact })
      return next
    }

    case 'remove-contact': {
      next.profile.contacts.splice(op.index, 1)
      return next
    }

    case 'set-item-meta': {
      const item = findItem(next, op.sectionId, op.itemId)
      if (!item) return next
      Object.assign(item, op.patch)
      return next
    }

    case 'set-bullet-text': {
      const bullet = findItem(next, op.sectionId, op.itemId)?.bullets.find(
        (entry) => entry.id === op.bulletId,
      )
      if (!bullet) return next
      bullet.text = op.text
      return next
    }

    case 'add-bullet': {
      const item = findItem(next, op.sectionId, op.itemId)
      if (!item) return next
      const bullet: Bullet = { id: op.bulletId, text: '' }
      item.bullets.push(bullet)
      return next
    }

    case 'remove-bullet': {
      const section = findSection(next, op.sectionId)
      const item = findItem(next, op.sectionId, op.itemId)
      if (!section || !item) return next
      item.bullets = item.bullets.filter((bullet) => bullet.id !== op.bulletId)
      // 删掉最后一条要点后，条目只剩空壳就一起删掉
      if (item.bullets.length === 0 && isEmptyItem(item)) {
        section.items = section.items.filter((entry) => entry.id !== op.itemId)
      }
      return next
    }

    case 'add-item': {
      const section = findSection(next, op.sectionId)
      if (!section) return next
      section.items.push({ id: op.itemId, bullets: [] })
      return next
    }

    case 'remove-item': {
      const section = findSection(next, op.sectionId)
      if (!section) return next
      section.items = section.items.filter((item) => item.id !== op.itemId)
      return next
    }
  }
}

/**
 * 专业技能分区是同一个条目里的一行行技能，新增落在已有的技能行上，
 * 没有条目时才建一个；其它分区新建的是带公司、职位与时间的条目。
 */
export function addSkillRow(
  draft: Draft,
  ids: { sectionId: string; itemId: string; bulletId: string },
): Draft {
  const next = cloneDraft(draft)
  const section = findSection(next, ids.sectionId)
  if (!section) return next

  let item = section.items[0]
  if (!item) {
    item = { id: ids.itemId, bullets: [] }
    section.items.push(item)
  }
  item.bullets.push({ id: ids.bulletId, text: '' })
  return next
}
