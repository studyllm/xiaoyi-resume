import type { DraftProfile } from '@/domain/types'
import { extractDateRange } from '@/domain/time'

const HEADLINE_LABELS = ['求职意向', '意向', '期望职位', '求职方向', '个人简介', '简介', '一句话', '定位']

const LABELLED_PATTERN = /([^\s：:，,；;]{1,12})[：:]\s*([^\s：:，,；;]+)/g

function isEmailLike(line: string): boolean {
  return line.includes('@') && !/[一-鿿]/.test(line)
}

function isPhoneLike(line: string): boolean {
  if (!/^[\d\s+()-]+$/.test(line)) return false
  return (line.match(/\d/g) ?? []).length >= 7
}

function looksLikeName(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 12) return false
  if (extractDateRange(trimmed)) return false
  return !isEmailLike(trimmed) && !isPhoneLike(trimmed)
}

function looksLikeHeadline(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 40) return false
  if (extractDateRange(trimmed)) return false
  return !isEmailLike(trimmed) && !isPhoneLike(trimmed)
}

/** 从简历正文头部（第一个分区表头之前）提取姓名、一句话定位与联系方式。 */
export function extractProfile(lines: string[]): DraftProfile {
  const profile: DraftProfile = { name: '', headline: '', contacts: [] }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (extractDateRange(line)) continue

    const pairs = [...line.matchAll(LABELLED_PATTERN)]
    if (pairs.length > 0) {
      for (const pair of pairs) {
        const label = pair[1]!.trim()
        const value = pair[2]!.trim()
        if (!label || !value) continue
        if (HEADLINE_LABELS.includes(label)) {
          if (!profile.headline) profile.headline = value
          continue
        }
        profile.contacts.push({ label, value })
      }
      continue
    }

    if (isEmailLike(line)) {
      profile.contacts.push({ label: '邮箱', value: line })
      continue
    }

    if (isPhoneLike(line)) {
      profile.contacts.push({ label: '手机', value: line })
      continue
    }

    if (!profile.name && looksLikeName(line)) {
      profile.name = line
      continue
    }

    if (!profile.headline && looksLikeHeadline(line)) {
      profile.headline = line
    }
  }

  return profile
}
