import type { ResumeVersion, VersionItem } from '../domain/types'

function dateLabel(item: VersionItem): string {
  if (!item.start) return ''
  if (item.present) return `${item.start} - 至今`
  if (item.end) return `${item.start} - ${item.end}`
  return item.start
}

function entryLine(item: VersionItem): string {
  const parts: string[] = []
  if (item.org) parts.push(`**${item.org}**`)
  if (item.title) parts.push(item.title)
  const dates = dateLabel(item)
  if (dates) parts.push(dates)
  return parts.join(' · ')
}

/** 把版本渲染为 Markdown：分区用二级标题，条目用加粗公司名开头的单行，要点用无序列表。 */
export function renderMarkdown(version: ResumeVersion): string {
  const lines: string[] = []
  const profile = version.profile

  if (profile?.name) lines.push(`# ${profile.name}`)
  if (profile?.headline) lines.push(profile.headline)
  if (profile?.contacts?.length) {
    lines.push(profile.contacts.map((contact) => contact.value).join(' · '))
  }
  if (lines.length > 0) lines.push('')

  for (const section of version.sections) {
    if (section.items.length === 0) continue
    lines.push(`## ${section.title}`)
    lines.push('')

    for (const item of section.items) {
      const header = entryLine(item)
      if (header) {
        lines.push(header)
        lines.push('')
      }
      for (const bullet of item.bullets) {
        lines.push(`- ${bullet.text}`)
      }
      if (item.bullets.length > 0) lines.push('')
    }
  }

  return lines.join('\n').trim()
}
