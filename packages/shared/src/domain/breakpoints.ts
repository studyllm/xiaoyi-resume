/**
 * 视口分档。
 *
 * 四档的分界固定在这里，视图不自己比数字——改一个分界只改一处，
 * 而且档位判定能单独测。
 */

/** 宽屏：侧栏、纸面、批注栏三块都放得下。 */
export const WIDE_WIDTH = 1440
/** 窄屏：侧栏仍常驻，纸面开始等比缩放。 */
export const NARROW_WIDTH = 1024
/** 紧凑：侧栏收成抽屉。 */
export const COMPACT_WIDTH = 768

export type ViewportTier = 'wide' | 'narrow' | 'compact' | 'too-small'

export function tierFor(width: number): ViewportTier {
  if (width >= WIDE_WIDTH) return 'wide'
  if (width >= NARROW_WIDTH) return 'narrow'
  if (width >= COMPACT_WIDTH) return 'compact'
  return 'too-small'
}

/** 这一档下应用侧栏是不是覆盖式的抽屉。 */
export function usesDrawer(tier: ViewportTier): boolean {
  return tier === 'compact' || tier === 'too-small'
}

/** 这一档下工作台还渲染不渲染。屏幕过小时只给降级提示。 */
export function rendersWorkbench(tier: ViewportTier): boolean {
  return tier !== 'too-small'
}
