// 把 pdf.js 运行时需要的静态资源拷进 public/。
//
// 为什么要拷：中文 PDF 常用 UniGB-UCS2-H 这类预定义 CMap 编码，
// pdf.js 要靠 cmaps/ 里的对照表才能把编码还原成文字；引用标准 14 号字体
// 而没内嵌字体的 PDF 则需要 standard_fonts/。这两份资源只存在于
// node_modules 里，浏览器拿不到。
//
// 为什么不从 CDN 取：产品不依赖网络。资源随构建产物一起发布。
import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(frontendRoot, '..')
// 依赖装在仓库根（npm workspace 会把依赖提升到根目录），但也容许装在 frontend 下面。
const source = [frontendRoot, repoRoot]
  .map((root) => resolve(root, 'node_modules/pdfjs-dist'))
  .find((candidate) => existsSync(candidate))
const target = resolve(frontendRoot, 'public/pdfjs')

if (!source) {
  console.error('找不到 pdfjs-dist：先跑一次 npm install')
  process.exit(1)
}

const directories = ['cmaps', 'standard_fonts']

for (const name of directories) {
  const from = resolve(source, name)
  const to = resolve(target, name)
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to, { recursive: true })
  console.log(`已就位：public/pdfjs/${name}`)
}
