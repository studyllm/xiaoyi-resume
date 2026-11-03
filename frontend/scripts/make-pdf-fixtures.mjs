// 生成上传路径的样例 PDF（需要本机有 Chrome）。
//
// 产物是提交进仓库的固定样本，测试与人工验收都基于它们——不依赖任何
// 第三方库，也不在 CI 上跑。重新生成：node scripts/make-pdf-fixtures.mjs
//
// 三份样本各自覆盖一种情况：
//   resume-text-layer.pdf    有完整文字层，含右对齐日期的条目头
//   resume-no-text.pdf       一个字都没有，模拟扫描件
//   resume-sparse-text.pdf   只有几个字，模拟识别率极低的扫描件
//   resume-two-column.pdf    左右两栏，两栏都有相当分量的文字
//   resume-core-skills.pdf   分区写成「核心技能」，复现用户报的丢内容问题
//   resume-self-review.pdf   带「自我评价」「获奖经历」这类没有位置归属的分区
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(frontendRoot, 'src/mock')

const chrome =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const page = (body, extra = '') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm; }
  body { font-family: "PingFang SC", "Songti SC", sans-serif; font-size: 11pt; color: #111; line-height: 1.7; }
  h2 { font-size: 13pt; margin: 18px 0 8px; border-bottom: 1px solid #333; }
  .row { display: flex; justify-content: space-between; }
  ul { margin: 4px 0 0; padding-left: 18px; }
</style></head><body>${extra}${body}</body></html>`

const withText = page(`
  <h2>教育背景</h2>
  <div class="row"><span>清华大学 计算机科学与技术</span><span>2014-09 - 2018-06</span></div>
  <ul><li>主修数据结构、操作系统与数据库系统，GPA 3.7/4.0</li></ul>
  <h2>工作经历</h2>
  <div class="row"><span>美团 前端工程师</span><span>2021-03 - 至今</span></div>
  <ul>
    <li>负责公司营销活动页面的前端开发，配合设计团队完成活动上线</li>
    <li>主导动平台前端架构升级，引入 Vue 3 与 Vite，页面构建时间从 120s 降到 18s</li>
  </ul>
  <div class="row"><span>阿里巴巴 前端工程师</span><span>2019-07 - 2021-02</span></div>
  <ul><li>参与商家后台管理系统开发，使用 React 完成 30+ 业务页面</li></ul>
  <h2>项目经历</h2>
  <div class="row"><span>经营数据可视化大屏</span><span>2022-05 - 2022-11</span></div>
  <ul><li>使用 Vue 与 ECharts 实现经营数据大屏，支持 12 个业务主题</li></ul>
  <h2>专业技能</h2>
  <ul><li>前端：Vue、React、TypeScript、Vite、Webpack</li></ul>
`)

const noText = page('', '<div style="height:600px;background:#eee"></div>')

// 文字少到平均每页不足 80 字符，落进 sparse 档
const sparseText = page('<div>个人简历</div>')

const twoColumn = page(
  `
  <h2>项目经历</h2>
  <div class="row"><span>经营数据可视化大屏</span><span>2022-05 - 2022-11</span></div>
  <ul><li>使用 Vue 与 ECharts 实现经营数据大屏，支持 12 个业务主题，覆盖经营、流量、留存三类指标</li></ul>
  `,
  '',
).replace(
  '</body>',
  `<div style="display:flex;gap:24px">
     <div style="flex:1">
       <h2>工作经历</h2>
       <div class="row"><span>美团 前端工程师</span><span>2021-03 - 至今</span></div>
       <ul><li>负责公司营销活动页面的前端开发，配合设计团队完成活动上线，覆盖十余个业务方</li></ul>
     </div>
     <div style="flex:1">
       <h2>专业技能</h2>
       <ul><li>前端：Vue、React、TypeScript、Vite、Webpack，工程化与性能优化</li></ul>
     </div>
   </div></body>`,
)

// 「核心技能」这种写法此前认不出来，整段内容会被吞进上一个分区
const coreSkills = page(`
  <h2>工作经历</h2>
  <div class="row"><span>美团 前端工程师</span><span>2021-03 - 至今</span></div>
  <ul><li>负责公司营销活动页面的前端开发，配合设计团队完成活动上线</li></ul>
  <h2>核心技能</h2>
  <ul><li>前端：Vue、React、TypeScript、Vite、Webpack</li></ul>
`)

// 「自我评价」「获奖经历」不对应四个主分区，它们下面的内容进「其它」分区
const selfReview = page(`
  <h2>工作经历</h2>
  <div class="row"><span>美团 前端工程师</span><span>2021-03 - 至今</span></div>
  <ul><li>负责公司营销活动页面的前端开发，配合设计团队完成活动上线</li></ul>
  <h2>自我评价</h2>
  <ul><li>团队协作良好，认真负责，积极向上</li></ul>
  <h2>获奖经历</h2>
  <ul><li>年度技术突破奖</li></ul>
`)

const fixtures = [
  { name: 'resume-text-layer.pdf', html: withText },
  { name: 'resume-no-text.pdf', html: noText },
  { name: 'resume-sparse-text.pdf', html: sparseText },
  { name: 'resume-two-column.pdf', html: twoColumn },
  { name: 'resume-core-skills.pdf', html: coreSkills },
  { name: 'resume-self-review.pdf', html: selfReview },
]

/**
 * 固定 PDF 里的时间戳。
 *
 * Chrome 生成的 PDF 带 CreationDate 与 ModDate，**每次重新生成字节都不同**。
 * 同一个样例在两个分支上 SHA 不同，GitHub 三方合并时二进制文件无解，会直接
 * 报冲突。把日期换成常量后，同样的 HTML 永远生成同样的字节——重新生成样例
 * 不再产生任何差异。
 */
const FIXED_PDF_DATE = 'D:20260101000000'

function normalizeTimestamp(file) {
  const buffer = readFileSync(file)
  const normalized = buffer.toString('latin1').replace(/D:\d{14}/g, FIXED_PDF_DATE)
  writeFileSync(file, Buffer.from(normalized, 'latin1'))
}

const workDir = mkdtempSync(resolve(tmpdir(), 'pdf-fixtures-'))

try {
  for (const fixture of fixtures) {
    const htmlPath = resolve(workDir, `${fixture.name}.html`)
    const outPath = resolve(outDir, fixture.name)
    writeFileSync(htmlPath, fixture.html, 'utf-8')
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-pdf-header-footer',
        `--print-to-pdf=${outPath}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'ignore' },
    )
    normalizeTimestamp(outPath)
    console.log(`已生成：src/mock/${fixture.name}`)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
