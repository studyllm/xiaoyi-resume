/** 没配环境变量时界面上用的产品名。 */
export const DEFAULT_PRODUCT_NAME = '小奕·简历'

/** 浏览器标签上跟在产品名后面的固定说明，不是产品名的一部分。 */
const DOCUMENT_TITLE_SUFFIX = '（原型演示）'

/**
 * 从配置原文得到要显示的产品名。
 *
 * 空白不算配置：留空、只打了空格，都回到默认名，避免顶栏变成一块空白。
 */
export function resolveProductName(raw: string | undefined): string {
  const name = raw?.trim()
  return name ? name : DEFAULT_PRODUCT_NAME
}

/** 浏览器标签：产品名加上固定的演示说明。 */
export function documentTitle(name: string): string {
  return `${name}${DOCUMENT_TITLE_SUFFIX}`
}
