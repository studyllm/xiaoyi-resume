import { FAILURE_STATES, WARNING_STATES, stateMessage, type StateCopy } from '@xiaoyi/shared/domain/states'

/**
 * 提取结果的文字质量。
 * - text-layer：有完整文字层，正常解析
 * - sparse：能读到的文字很少，多半是扫描件
 * - none：没有文字层
 * - ocr：预留——将来接入 OCR 时用，调用方不用改
 */
export type PdfTextQuality = 'text-layer' | 'sparse' | 'none' | 'ocr'

export type PdfTextFailureReason =
  | 'not-pdf'
  | 'too-large'
  | 'too-many-pages'
  | 'encrypted'
  | 'corrupted'
  | 'unknown'

export interface PdfTextFailure {
  reason: PdfTextFailureReason
  /** 状态表里对应的那条，文案与用户能做的下一步都在那里。 */
  state: StateCopy
  vars?: Record<string, string | number>
}

export interface PdfTextResult {
  ok: boolean
  text: string
  pageCount: number
  quality: PdfTextQuality
  warnings: string[]
  failure: PdfTextFailure | null
}

export interface PdfTextOptions {
  /** pdf.js 的 CMap 目录。中文 PDF 常用预定义 CMap 编码，缺了它文字解不出来。 */
  cMapUrl?: string
  /** pdf.js 的标准字体目录。引用标准 14 号字体而没内嵌字体的 PDF 需要它。 */
  standardFontDataUrl?: string
}

/** 文件大小上限。一份文本型简历 PDF 通常不到 1MB。 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

/** 页数上限。简历通常 1–3 页，这个上限挡的是「误传了一本扫描版教材」。 */
export const MAX_PDF_PAGES = 50

/**
 * 低于这个平均每页字符数就判为「文字很少」。
 *
 * 一份正常简历每页约 500–2000 字符；80 远低于任何有文字层的简历的下限，
 * 意味着这个 PDF 大概率是扫描件（能识别出的往往只有页眉、页脚、水印）。
 * 刻意压得低，是为了不把「简历本身很简短」误判成扫描件——宁可多提示一次，
 * 也不要把能用的文件说成不能用。
 */
export const SPARSE_CHARS_PER_PAGE = 80

const PDF_MAGIC = '%PDF-'

/**
 * 需要还原成常用字的兼容区段。
 *
 * PDF 里同一个字形可能对应好几个码位，生成器写出来的往往是其中靠前的那个——
 * 典型是康熙部首：「工作经历」会变成「⼯作经历」（U+2F2F）。
 * 不还原的话，每个分区标题都认不出来，整份解析结果直接错位。
 *
 * 只处理这几个兼容区段，不用整段的 NFKC——后者会把中文全角标点也一并
 * 变成半角（「，」变「,」），那是用户没要求的内容改动。
 */
const COMPATIBILITY_PATTERN = /[⺀-⻿⼀-⿕豈-﫿︰-﹏]/g

/**
 * 简化部首 → 对应的简体字。
 *
 * Unicode 没给这些字符兼容分解——页是后来的简化字，⻚ 是它的部首形态，
 * 两者字形相同，NFKC 救不了，只能手工映射。
 *
 * 只收「部首形态与该简体字同形」的：见、贝、车、长、门、页、风、飞、马、鱼、
 * 鸟、盐、麦、黄、齐、齿、龙、龟、韦、角、蛙、半。
 *
 * 部首形态与完整汉字不同形的（讠、钅、饣、辶、纟）不收——它们对应哪个字
 * 无法确定，原样留下比猜一个更诚实。反正那类字形与说、钱、饭这类完整汉字
 * 并不同形，不会被误映射成部首码位。
 */
export const SIMPLIFIED_RADICALS: Record<string, string> = {
  '⺦': '半',
  '⻅': '见',
  '⻆': '角',
  '⻉': '贝',
  '⻋': '车',
  '⻓': '长',
  '⻔': '门',
  '⻙': '韦',
  '⻚': '页',
  '⻛': '风',
  '⻜': '飞',
  '⻢': '马',
  '⻥': '鱼',
  '⻦': '鸟',
  '⻧': '盐',
  '⻨': '麦',
  '⻩': '黄',
  '⻪': '蛙',
  '⻫': '齐',
  '⻬': '齐',
  '⻭': '齿',
  '⻮': '齿',
  '⻯': '龙',
  '⻰': '龙',
  '⻲': '龟',
  '⻳': '龟',
}

interface PdfTextItem {
  str: string
  width: number
  height: number
  transform: number[]
}

function normalizeCompatibility(text: string): string {
  return text
    .replace(COMPATIBILITY_PATTERN, (char) => SIMPLIFIED_RADICALS[char] ?? char.normalize('NFKC'))
}

/**
 * 读出字节。
 *
 * 浏览器与 Node 的 Blob 都有 arrayBuffer()，jsdom 的没有；FileReader 正好相反。
 * 两条路都留着，哪个可用走哪条。
 *
 * 不用 new Response(blob)——那会把 Blob 字符串化成 "[object Blob]"，
 * 拿到的是错数据还不报错。
 */
function readBytes(blob: Blob): Promise<ArrayBuffer> {
  const maybe = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (typeof maybe.arrayBuffer === 'function') return maybe.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsArrayBuffer(blob)
  })
}

function failure(
  reason: PdfTextFailureReason,
  state: StateCopy,
  vars?: Record<string, string | number>,
): PdfTextResult {
  return {
    ok: false,
    text: '',
    pageCount: 0,
    quality: 'none',
    warnings: [],
    failure: { reason, state, vars },
  }
}

/** 按 y 坐标把片段聚成视觉行，行内按 x 排序。 */
function groupIntoLines(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort(
    (a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  )
  const lines: PdfTextItem[][] = []
  let current: PdfTextItem[] = []
  let currentY = 0

  for (const item of sorted) {
    const y = item.transform[5]
    if (current.length === 0) {
      current = [item]
      currentY = y
      continue
    }
    const tolerance = Math.max(2, (item.height || 10) * 0.5)
    if (Math.abs(y - currentY) <= tolerance) {
      current.push(item)
      continue
    }
    lines.push(current)
    current = [item]
    currentY = y
  }
  if (current.length > 0) lines.push(current)
  return lines
}

/**
 * 把一行拼成一行文字。
 *
 * 空白片段贡献一个空格——PDF 里真空格是一个独立的空白片段（宽约 5pt），
 * 两端对齐的间隔也是空白片段（宽可达 340pt）。片段本身就是「这里有空格」
 * 的明确信号，比拿几何间距去猜可靠得多。
 *
 * 整行输出为一行，**不因为左右间距大而拆行**——中文简历的条目头是
 * 「公司 职位 …… 起止日期」两端对齐的，拆开会让解析器认不出条目。
 */
function joinLine(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4])
  let out = ''
  let pendingSpace = false
  let previousRight = 0

  for (const item of sorted) {
    if (item.str === '') {
      // 零宽的空白片段是渲染产物，不贡献空格
      if (item.width > 0) pendingSpace = out !== ''
      continue
    }
    if (item.str.trim() === '') {
      pendingSpace = out !== ''
      continue
    }
    if (pendingSpace) {
      out += ' '
      pendingSpace = false
    } else if (out !== '') {
      // 没有空白片段但间距明显是排版留白时，仍然补一个空格
      const gap = item.transform[4] - previousRight
      const fontSize = item.height || 10
      if (gap > fontSize * 1.5) out += ' '
    }
    out += item.str
    previousRight = item.transform[4] + (item.width || 0)
  }

  return out.trim()
}

function judgeQuality(text: string, pageCount: number): PdfTextQuality {
  const chars = text.replace(/\s/g, '').length
  if (chars === 0) return 'none'
  if (pageCount > 0 && chars / pageCount < SPARSE_CHARS_PER_PAGE) return 'sparse'
  return 'text-layer'
}

function classifyError(error: unknown): PdfTextFailureReason {
  const name = (error as { name?: string })?.name ?? ''
  if (name === 'PasswordException') return 'encrypted'
  if (name === 'InvalidPDFException') return 'corrupted'
  return 'unknown'
}

function stateFor(reason: PdfTextFailureReason): StateCopy {
  switch (reason) {
    case 'encrypted':
      return FAILURE_STATES['pdf-encrypted']
    case 'corrupted':
      return FAILURE_STATES['pdf-corrupted']
    default:
      return FAILURE_STATES['pdf-unreadable']
  }
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjsPromise: Promise<PdfJsModule> | null = null

function loadPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then(async (module) => {
      // 用 legacy 构建：标准构建依赖 Promise.try，Node 22 与部分浏览器没有。
      // 只有真正能跑 Web Worker 的环境才把 worker 指向打包出来的文件——
      // jsdom 没有 Worker，Node 也没有，两边都让 pdf.js 走自己的假 worker。
      if (typeof Worker !== 'undefined') {
        const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
        module.GlobalWorkerOptions.workerSrc = workerUrl
      }
      return module
    })
  }
  return pdfjsPromise
}

/**
 * 从 PDF 的文字层提取文本。
 *
 * 只提取，不解析——提取出的文本交给 `draftStore.ingest`，与粘贴路径共用
 * 解析、置信度、结构问题清单、纸面编辑与保存的全部下游。
 */
export async function extractPdfText(
  file: File,
  options: PdfTextOptions = {},
): Promise<PdfTextResult> {
  if (file.size > MAX_PDF_BYTES) {
    return failure('too-large', FAILURE_STATES['pdf-too-large'], {
      value: MAX_PDF_BYTES / 1024 / 1024,
    })
  }

  // 文件类型按文件自身判定，不信浏览器给的 MIME——改个扩展名就能骗过它
  const magic = new TextDecoder().decode(new Uint8Array(await readBytes(file.slice(0, 5))))
  if (magic !== PDF_MAGIC) {
    return failure('not-pdf', FAILURE_STATES['pdf-not-pdf'])
  }

  const base = import.meta.env.BASE_URL || '/'
  const cMapUrl = options.cMapUrl ?? `${base}pdfjs/cmaps/`
  const standardFontDataUrl = options.standardFontDataUrl ?? `${base}pdfjs/standard_fonts/`

  let pdfjs: PdfJsModule
  try {
    pdfjs = await loadPdfjs()
  } catch {
    return failure('unknown', FAILURE_STATES['pdf-engine-unavailable'])
  }

  const data = new Uint8Array(await readBytes(file))
  let document_: Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>
  let loadingTask: ReturnType<PdfJsModule['getDocument']>
  try {
    loadingTask = pdfjs.getDocument({
      data,
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
    })
    document_ = await loadingTask.promise
  } catch (error) {
    const reason = classifyError(error)
    return failure(reason, stateFor(reason))
  }

  try {
    if (document_.numPages > MAX_PDF_PAGES) {
      return failure('too-many-pages', FAILURE_STATES['pdf-too-many-pages'], {
        value: document_.numPages,
      })
    }

    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document_.numPages; pageNumber += 1) {
      const page = await document_.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = groupIntoLines(content.items as unknown as PdfTextItem[])
      pages.push(lines.map(joinLine).filter((line) => line !== '').join('\n'))
      page.cleanup()
    }

    const text = normalizeCompatibility(pages.join('\n'))
    const quality = judgeQuality(text, document_.numPages)

    const warnings: string[] = []
    if (quality === 'sparse') {
      warnings.push(stateMessage(WARNING_STATES['pdf-sparse']))
    }

    return {
      ok: true,
      text,
      pageCount: document_.numPages,
      quality,
      warnings,
      failure: null,
    }
  } catch (error) {
    const reason = classifyError(error)
    return failure(reason, stateFor(reason))
  } finally {
    // 销毁走 loading task——v6 的文档对象上没有 destroy
    await loadingTask.destroy()
  }
}
