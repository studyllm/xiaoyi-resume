import { describe, expect, it } from 'vitest'

import {
  compareYearMonth,
  extractDateRange,
  findDateSpan,
  isValidYearMonth,
  normalizeYearMonth,
  rangesOverlap,
} from './time'

describe('normalizeYearMonth', () => {
  it('normalizes dot separated months', () => {
    expect(normalizeYearMonth('2021.03')).toBe('2021-03')
  })

  it('normalizes slash separated months with a single digit', () => {
    expect(normalizeYearMonth('2021/3')).toBe('2021-03')
  })

  it('normalizes Chinese year-month notation', () => {
    expect(normalizeYearMonth('2021年3月')).toBe('2021-03')
  })

  it('normalizes already canonical values', () => {
    expect(normalizeYearMonth('2021-03')).toBe('2021-03')
  })

  it('rejects months outside the calendar range', () => {
    expect(normalizeYearMonth('2021.13')).toBeNull()
  })

  it('rejects text that carries no date', () => {
    expect(normalizeYearMonth('abc')).toBeNull()
  })

  it('rejects the "present" marker', () => {
    expect(normalizeYearMonth('至今')).toBeNull()
  })
})

describe('isValidYearMonth', () => {
  it('accepts a canonical value', () => {
    expect(isValidYearMonth('2021-03')).toBe(true)
  })

  it('rejects an out-of-range month', () => {
    expect(isValidYearMonth('2021-13')).toBe(false)
  })

  it('rejects a non zero-padded month', () => {
    expect(isValidYearMonth('2021-3')).toBe(false)
  })

  it('rejects a two digit year', () => {
    expect(isValidYearMonth('21-03')).toBe(false)
  })
})

describe('compareYearMonth', () => {
  it('orders by year then month', () => {
    expect(compareYearMonth('2021-03', '2020-12')).toBeGreaterThan(0)
  })

  it('reports equality for identical values', () => {
    expect(compareYearMonth('2021-03', '2021-03')).toBe(0)
  })
})

describe('extractDateRange', () => {
  it('reads a full range', () => {
    expect(extractDateRange('2021.03 - 2023.06')).toEqual({
      start: '2021-03',
      end: '2023-06',
      present: false,
    })
  })

  it('reads a range that ends at the present marker', () => {
    expect(extractDateRange('2021/03 - 至今')).toEqual({
      start: '2021-03',
      end: null,
      present: true,
    })
  })

  it('reads a range written with Chinese year-month notation', () => {
    expect(extractDateRange('2021年3月 - 2023年6月')).toEqual({
      start: '2021-03',
      end: '2023-06',
      present: false,
    })
  })

  it('reads a range whose months are single digit', () => {
    expect(extractDateRange('2021.3 - 2021.9')).toEqual({
      start: '2021-03',
      end: '2021-09',
      present: false,
    })
  })

  it('reads a start date followed by the present marker', () => {
    expect(extractDateRange('2021.03 至今')).toEqual({
      start: '2021-03',
      end: null,
      present: true,
    })
  })

  it('returns null when no date is present', () => {
    expect(extractDateRange('无日期信息')).toBeNull()
  })
})

describe('findDateSpan', () => {
  it('reports the position of a date range inside a header line', () => {
    const line = '字节跳动 前端工程师 2021.03 - 至今'
    const span = findDateSpan(line)
    expect(span).not.toBeNull()
    expect(line.slice(span!.start, span!.end)).toBe('2021.03 - 至今')
  })

  it('reports the position of a closed range', () => {
    const line = '清华大学 计算机 2015.09 - 2019.06'
    const span = findDateSpan(line)
    expect(line.slice(span!.start, span!.end)).toBe('2015.09 - 2019.06')
  })

  it('returns null when the line carries no date', () => {
    expect(findDateSpan('熟悉 Vue 生态')).toBeNull()
  })
})

describe('rangesOverlap', () => {
  it('detects overlapping intervals', () => {
    expect(
      rangesOverlap(
        { start: '2021-01', end: '2022-01', present: false },
        { start: '2021-06', end: '2022-06', present: false },
      ),
    ).toBe(true)
  })

  it('does not treat a handover month as overlapping', () => {
    // 简历里相邻两段经历首尾相接是常态：这一段结束在 2022-01，下一段就从
    // 2022-01 开始。那是交接，不是同时干两份。
    expect(
      rangesOverlap(
        { start: '2021-01', end: '2022-01', present: false },
        { start: '2022-01', end: '2023-01', present: false },
      ),
    ).toBe(false)
  })

  it('treats two shared months as overlapping', () => {
    expect(
      rangesOverlap(
        { start: '2021-01', end: '2022-01', present: false },
        { start: '2021-12', end: '2023-01', present: false },
      ),
    ).toBe(true)
  })

  it('reports no overlap for disjoint intervals', () => {
    expect(
      rangesOverlap(
        { start: '2021-01', end: '2021-12', present: false },
        { start: '2022-01', end: '2023-01', present: false },
      ),
    ).toBe(false)
  })

  it('treats an ongoing interval as reaching into the future', () => {
    expect(
      rangesOverlap(
        { start: '2021-01', end: null, present: true },
        { start: '2020-01', end: '2021-06', present: false },
      ),
    ).toBe(true)
  })

  it('reports no overlap when the other interval ends before the ongoing one starts', () => {
    expect(
      rangesOverlap(
        { start: '2022-01', end: null, present: true },
        { start: '2020-01', end: '2021-06', present: false },
      ),
    ).toBe(false)
  })

  it('reports no overlap when an end date is unknown', () => {
    expect(
      rangesOverlap(
        { start: '2021-01', end: null, present: false },
        { start: '2021-06', end: '2022-06', present: false },
      ),
    ).toBe(false)
  })
})

describe('只有年份与英文月份的写法', () => {
  it('读出只有年份的区间', () => {
    expect(extractDateRange('2019 - 2022')).toEqual({
      start: '2019-01',
      end: '2022-12',
      present: false,
    })
  })

  it('读出用全角波浪号连接的年份区间', () => {
    expect(extractDateRange('2019～2022')).toEqual({
      start: '2019-01',
      end: '2022-12',
      present: false,
    })
  })

  it('读出英文月份写的区间', () => {
    expect(extractDateRange('Mar 2021 - Jun 2022')).toEqual({
      start: '2021-03',
      end: '2022-06',
      present: false,
    })
  })

  it('英文月份后接至今', () => {
    expect(extractDateRange('Mar 2021 - Present')).toEqual({
      start: '2021-03',
      end: null,
      present: true,
    })
  })

  it('带月份写法的区间不被当成只有年份', () => {
    expect(extractDateRange('2019-06 - 2022-08')).toEqual({
      start: '2019-06',
      end: '2022-08',
      present: false,
    })
  })

  it('报出只有年份的区间在行内的位置', () => {
    const line = '美团 前端工程师 2019 - 2022'
    const span = findDateSpan(line)
    expect(span).not.toBeNull()
    expect(line.slice(span!.start, span!.end)).toBe('2019 - 2022')
    expect(span!.range.start).toBe('2019-01')
    expect(span!.range.end).toBe('2022-12')
  })
})

describe('不该被当成日期的写法', () => {
  it('手机号不会被当成只有年份的区间', () => {
    expect(extractDateRange('138-0000-0000')).toBeNull()
    expect(findDateSpan('138-0000-0000')).toBeNull()
  })

  it('年份超出合理区间的写法不算日期', () => {
    expect(extractDateRange('0000 - 0000')).toBeNull()
    expect(extractDateRange('9999 - 9999')).toBeNull()
  })
})
