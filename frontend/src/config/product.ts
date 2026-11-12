import { resolveProductName } from './productName'

/**
 * 当前生效的产品名。
 *
 * 只读 `VITE_PRODUCT_NAME`。改这个值要重启前端开发服务器（或重新构建），
 * Vite 在启动时把环境变量写进包里，运行中改文件不会热更新。
 */
export function productName(): string {
  return resolveProductName(import.meta.env.VITE_PRODUCT_NAME)
}
