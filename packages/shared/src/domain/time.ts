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

/**
 * 只有年份的区间，如「2019 - 2022」。
 *
 * 单独识别是因为月的写法会把它误读：「2019 - 2022」里的「2019 - 20」正好符合
 * 「年 + 分隔符 + 月」，取出来的月份是 20，不合法，整个区间就废了。
 *
 * 年份要落在合理区间内——否则手机号「138-0000-0000」里的「0000-0000」会被
 * 当成年份区间，那行就成不了联系方式。
 */
const YEAR_RANGE_PATTERN = /(\d{4})\s*[-–—~～至到]\s*(\d{4})/

/** 简历里可能出现的年份区间。下限早到任何一届毕业生，上限留到未来。 */
const MIN_YEAR = 1950
const MAX_YEAR = 2100

function isPlausibleYear(year: string): boolean {
  const value = Number(year)
  return value >= MIN_YEAR && value <= MAX_YEAR
}

/** 英文月份，如「Mar 2021 - Jun 2022」。 */
const ENGLISH_MONTH_PATTERN =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi

const ENGLISH_MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

interface DateSpanHit {
  /** 命中区间在原文中的起止位置 */
  start: number
  end: number
  range: DateRange
}

/** 只有年份的区间：起始年 1 月到结束年 12 月。 */
function findYearSpan(text: string): DateSpanHit | null {
  const matched = YEAR_RANGE_PATTERN.exec(text)
  if (!matched) return null
  if (!isPlausibleYear(matched[1]) || !isPlausibleYear(matched[2])) return null
  return {
    start: matched.index,
    end: matched.index + matched[0].length,
    range: { start: `${matched[1]}-01`, end: `${matched[2]}-12`, present: false },
  }
}

/** 英文月份写法的区间。 */
function findEnglishSpan(text: string): DateSpanHit | null {
  const matched = [...text.matchAll(ENGLISH_MONTH_PATTERN)]
  if (matched.length === 0) return null

  const first = matched[0]!
  const firstMonth = ENGLISH_MONTHS[first[1]!.toLowerCase()]
  if (!firstMonth) return null
  const start = `${first[2]}-${firstMonth}`
  const firstStart = first.index ?? 0

  if (matched.length >= 2) {
    const second = matched[1]!
    const secondMonth = ENGLISH_MONTHS[second[1]!.toLowerCase()]
    if (!secondMonth) return null
    return {
      start: firstStart,
      end: (second.index ?? 0) + second[0].length,
      range: { start, end: `${second[2]}-${secondMonth}`, present: false },
    }
  }

  const after = text.slice(firstStart + first[0].length)
  const presentMatch = presentRegex().exec(after)
  if (presentMatch) {
    return {
      start: firstStart,
      end: firstStart + first[0].length + presentMatch.index + presentMatch[0].length,
      range: { start, end: null, present: true },
    }
  }
  return {
    start: firstStart,
    end: firstStart + first[0].length,
    range: { start, end: null, present: false },
  }
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
  const yearSpan = findYearSpan(text)
  if (yearSpan) return yearSpan.range
  const englishSpan = findEnglishSpan(text)
  if (englishSpan) return englishSpan.range

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
  // 严格小于：**共用一个月不算重叠**。简历里相邻两段经历首尾相接是常态
  // （这一段结束在 2020-09，下一段就从 2020-09 开始），那是交接，不是同时干两份。
  // 共用两个月以上才是真重叠。
  return compareYearMonth(a.start, bEnd) < 0 && compareYearMonth(b.start, aEnd) < 0
}

export interface DateSpan {
  start: number
  end: number
  range: DateRange
}

export function findDateSpan(text: string): DateSpan | null {
  const yearSpan = findYearSpan(text)
  if (yearSpan) return yearSpan
  const englishSpan = findEnglishSpan(text)
  if (englishSpan) return englishSpan

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
