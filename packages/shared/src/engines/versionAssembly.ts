import type { DraftItem, DraftProfile, Jd, UncoveredRequirement, VersionSection } from '../domain/types'
import type { CoverageTier, RequirementCoverage } from './types'

export function tierRank(tier: CoverageTier): number {
  return tier === 'strong' ? 2 : tier === 'weak' ? 1 : 0
}

export function buildUncovered(coverage: RequirementCoverage[], jd: Jd): UncoveredRequirement[] {
  return coverage
    .filter((entry) => entry.tier === 'none')
    .map((entry) => {
      const requirement = jd.requirements.find((item) => item.id === entry.requirementId)
      const plannedOnly = entry.reason === 'planned-only'
      return {
        requirementId: entry.requirementId,
        text: requirement?.text ?? entry.text,
        keywords: entry.keywords,
        reason: plannedOnly ? 'planned-only' : 'no-match',
        explanation: plannedOnly
          ? '你的简历里只以计划、预计这类规划性表述出现，没有已完成的事实'
          : '你的简历中没有找到对应的事实',
      }
    })
}

export function dateLabel(item: DraftItem): string {
  if (!item.start) return ''
  if (item.present) return `${item.start} - 至今`
  if (item.end) return `${item.start} - ${item.end}`
  return item.start
}

export function itemHeader(item: DraftItem): string {
  const parts: string[] = []
  if (item.org) parts.push(item.org)
  if (item.title) parts.push(item.title)
  const dates = dateLabel(item)
  if (dates) parts.push(dates)
  return parts.join(' | ')
}

export function itemLabel(item: DraftItem): string {
  if (item.org && item.title) return `${item.org} · ${item.title}`
  return item.org ?? item.title ?? ''
}

export function assembleBody(sections: VersionSection[], profile?: DraftProfile): string {
  const lines: string[] = []

  if (profile?.name) lines.push(profile.name)
  if (profile?.headline) lines.push(profile.headline)
  if (profile?.contacts?.length) {
    lines.push(profile.contacts.map((contact) => contact.value).join(' | '))
  }
  if (lines.length > 0) lines.push('')

  for (const section of sections) {
    if (section.items.length === 0) continue
    lines.push(section.title)
    for (const item of section.items) {
      const header = itemHeader(item)
      if (header) lines.push(header)
      for (const bullet of item.bullets) lines.push(`· ${bullet.text}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export function diffReason(input: { change: string; placement: string }): string {
  if (input.change === 'rewrite') return '只调整了措辞与排版，事实没有变化'
  if (input.placement === 'to-end') return '与该 JD 无关，排在条目末尾'
  return '与简历一致，原样保留'
}