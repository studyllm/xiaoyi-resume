export type YearMonth = string

export interface DateRange {
  start: YearMonth | null
  end: YearMonth | null
  present: boolean
}

const OPEN_END = '9999-12'

function dateRegex(): RegExp {
  return /(\d{4})\s*[年./\-]\s*(\d{1,2})\s*月?/g
}

function presentRegex(): RegExp {
  return /至今|present|now|现在/i
}

export function isValidYearMonth(value: string): boolean {
  const matched = /^(\d{4})-(\d{2})$/.exec(value)
  if (!matched) return false
  const month = Number(matched[2])
  return month >= 1 && month <= 12
}

export function normalizeYearMonth(raw: string): YearMonth | null {
  const matched = /(\d{4})\s*[年./\-]\s*(\d{1,2})\s*月?/.exec(raw)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2, '0')}`
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  const [aYear, aMonth] = a.split('-').map(Number)
  const [bYear, bMonth] = b.split('-').map(Number)
  if (aYear !== bYear) return aYear < bYear ? -1 : 1
  if (aMonth !== bMonth) return aMonth < bMonth ? -1 : 1
  return 0
}

export function extractDateRange(text: string): DateRange | null {
  const matched = [...text.matchAll(dateRegex())]
  if (matched.length === 0) return null

  const start = normalizeYearMonth(matched[0]![0])
  if (!start) return null

  if (matched.length >= 2) {
    const end = normalizeYearMonth(matched[1]![0])
    if (!end) return null
    return { start, end, present: false }
  }

  return { start, end: null, present: presentRegex().test(text) }
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  if (!a.start || !b.start) return false
  const aEnd = a.present ? OPEN_END : a.end
  const bEnd = b.present ? OPEN_END : b.end
  if (!aEnd || !bEnd) return false
  return compareYearMonth(a.start, bEnd) <= 0 && compareYearMonth(b.start, aEnd) <= 0
}

export interface DateSpan {
  start: number
  end: number
  range: DateRange
}

export function findDateSpan(text: string): DateSpan | null {
  const matched = [...text.matchAll(dateRegex())]
  if (matched.length === 0) return null

  const first = matched[0]!
  const firstStart = first.index
  const start = normalizeYearMonth(first[0])
  if (!start) return null

  const presentMatch = /至今|present|now|现在/i.exec(text.slice(firstStart + first[0].length))
  if (presentMatch) {
    const end = firstStart + first[0].length + presentMatch.index + presentMatch[0].length
    return { start: firstStart, end, range: { start, end: null, present: true } }
  }

  if (matched.length >= 2) {
    const second = matched[1]!
    const end = normalizeYearMonth(second[0])
    if (!end) return null
    return {
      start: firstStart,
      end: second.index + second[0].length,
      range: { start, end, present: false },
    }
  }

  return {
    start: firstStart,
    end: firstStart + first[0].length,
    range: { start, end: null, present: false },
  }
}
