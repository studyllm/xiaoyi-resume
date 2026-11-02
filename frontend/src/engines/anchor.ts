import type { DiagnosisIssue, Draft } from '@/domain/types'

export type AnchorLevel = 'section' | 'item' | 'bullet'

/** 意见挂在简历的哪一层：有要点挂要点，只有条目的挂条目标题，都没有的挂分区标题。 */
export function anchorLevel(issue: DiagnosisIssue): AnchorLevel {
  if (issue.bulletId) return 'bullet'
  if (issue.itemId) return 'item'
  return 'section'
}

/** 锚定的文字，即批注在简历上高亮的那一段。 */
export function anchorText(issue: DiagnosisIssue): string {
  if (anchorLevel(issue) === 'bullet') return issue.highlight || issue.quote
  if (anchorLevel(issue) === 'item') return issue.itemLabel
  return issue.sectionTitle
}

interface Position {
  section: number
  item: number
  bullet: number
}

function positionOf(draft: Draft, issue: DiagnosisIssue): Position {
  let section = Number.MAX_SAFE_INTEGER
  let item = Number.MAX_SAFE_INTEGER
  let bullet = Number.MAX_SAFE_INTEGER

  draft.sections.forEach((candidate, sectionIndex) => {
    if (candidate.id === issue.sectionId) section = sectionIndex
    candidate.items.forEach((entry, itemIndex) => {
      if (entry.id === issue.itemId) item = itemIndex
      entry.bullets.forEach((point, bulletIndex) => {
        if (point.id === issue.bulletId) bullet = bulletIndex
      })
    })
  })

  // 条目级意见挂在条目标题行上，排在该条目的要点之前
  if (issue.itemId && !issue.bulletId) bullet = -1
  // 分区级意见挂在分区标题上，排在该分区的条目之前
  if (!issue.itemId) item = -1

  return { section, item, bullet }
}

/** 按意见在简历中出现的先后顺序排列，而不是按严重度。 */
export function orderByDocument(draft: Draft, issues: DiagnosisIssue[]): DiagnosisIssue[] {
  return issues
    .map((issue, index) => ({ issue, index, position: positionOf(draft, issue) }))
    .sort((left, right) => {
      const bySection = left.position.section - right.position.section
      if (bySection !== 0) return bySection
      const byItem = left.position.item - right.position.item
      if (byItem !== 0) return byItem
      const byBullet = left.position.bullet - right.position.bullet
      if (byBullet !== 0) return byBullet
      return left.index - right.index
    })
    .map((entry) => entry.issue)
}
