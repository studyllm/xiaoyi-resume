import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 纸面自然宽度 210mm，在 96dpi 下约等于这个像素数。 */
export const PAPER_WIDTH_PX = 794

/**
 * 缩放的下限。
 *
 * 再窄纸面就小到读不了了。低于这个比例宁可让内容横向滚动，
 * 也不给用户一份看不清的纸面。
 */
export const MIN_PAPER_SCALE = 0.7

/**
 * 按容器可用宽度算纸面的缩放比例。
 *
 * 量的是**没有缩放的容器**——缩放过的元素量出来的是缩放后的尺寸，
 * 拿它去除会越算越小。
 */
export function usePaperScale(host: Ref<HTMLElement | null>): { scale: Ref<number> } {
  const scale = ref(1)

  function update(): void {
    const width = host.value?.clientWidth ?? 0
    if (width <= 0) return
    scale.value = Math.max(MIN_PAPER_SCALE, Math.min(1, width / PAPER_WIDTH_PX))
  }

  onMounted(() => {
    update()
    if (typeof ResizeObserver === 'undefined' || !host.value) return
    const observer = new ResizeObserver(update)
    observer.observe(host.value)
    onBeforeUnmount(() => observer.disconnect())
  })

  return { scale }
}
