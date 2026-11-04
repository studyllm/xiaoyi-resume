import { describe, expect, it } from 'vitest'

import {
  COMPACT_WIDTH,
  NARROW_WIDTH,
  WIDE_WIDTH,
  rendersWorkbench,
  tierFor,
  usesDrawer,
} from './breakpoints'

describe('视口分档', () => {
  it('分界值本身落在更宽的那一档', () => {
    expect(tierFor(WIDE_WIDTH)).toBe('wide')
    expect(tierFor(NARROW_WIDTH)).toBe('narrow')
    expect(tierFor(COMPACT_WIDTH)).toBe('compact')
  })

  it('比分界小一个像素就落到下一档', () => {
    expect(tierFor(WIDE_WIDTH - 1)).toBe('narrow')
    expect(tierFor(NARROW_WIDTH - 1)).toBe('compact')
    expect(tierFor(COMPACT_WIDTH - 1)).toBe('too-small')
  })

  it('紧凑档与过小档都用抽屉', () => {
    expect(usesDrawer('wide')).toBe(false)
    expect(usesDrawer('narrow')).toBe(false)
    expect(usesDrawer('compact')).toBe(true)
    expect(usesDrawer('too-small')).toBe(true)
  })

  it('屏幕过小时不渲染工作台', () => {
    expect(rendersWorkbench('wide')).toBe(true)
    expect(rendersWorkbench('narrow')).toBe(true)
    expect(rendersWorkbench('compact')).toBe(true)
    expect(rendersWorkbench('too-small')).toBe(false)
  })
})
