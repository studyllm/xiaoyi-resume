import { onBeforeUnmount, onMounted } from 'vue'

import { useUiStore } from '@/stores/ui'

/**
 * 视口尺寸的唯一监听点。
 *
 * 各处不再各挂一个 resize 监听——监听多了既费性能，又容易在卸载时漏掉。
 */
export function useViewport(): void {
  const uiStore = useUiStore()

  function sync(): void {
    uiStore.setViewportWidth(window.innerWidth)
  }

  onMounted(() => {
    sync()
    window.addEventListener('resize', sync)
  })

  onBeforeUnmount(() => window.removeEventListener('resize', sync))
}
