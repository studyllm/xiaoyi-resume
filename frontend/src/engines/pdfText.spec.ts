import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { extractPdfText, MAX_PDF_BYTES, SIMPLIFIED_RADICALS, type PdfTextResult } from './pdfText'
import { stateMessage } from '@/domain/states'

/** 失败时用户看到的那一整句话。 */
function failureText(result: PdfTextResult): string {
  if (!result.failure) return ''
  return stateMessage(result.failure.state, result.failure.vars)
}

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../mock/${name}`, import.meta.url))
}

async function pdfFile(name: string): Promise<File> {
  const buffer = await readFile(fixturePath(name))
  return new File([new Uint8Array(buffer)], name, { type: 'application/pdf' })
}

describe('extractPdfText', () => {
  it('从带文字层的 PDF 里取出四个分区', async () => {
    const result = await extractPdfText(await pdfFile('resume-text-layer.pdf'))

    expect(result.ok).toBe(true)
    expect(result.quality).toBe('text-layer')
    expect(result.pageCount).toBe(1)
    expect(result.text).toContain('教育背景')
    expect(result.text).toContain('工作经历')
    expect(result.text).toContain('项目经历')
    expect(result.text).toContain('专业技能')
  })

  it('条目头与它的起止日期留在同一行', async () => {
    const result = await extractPdfText(await pdfFile('resume-text-layer.pdf'))
    const lines = result.text.split('\n')

    const header = lines.find((line) => line.includes('美团'))
    expect(header).toBeDefined()
    expect(header).toContain('2021-03')
    expect(header).toContain('至今')
    // 日期没被拆到另一行去
    expect(lines.some((line) => line.trim() === '2021-03 - 至今')).toBe(false)
  })

  it('简化部首映射表的目标都是常用汉字', () => {
    for (const [radical, target] of Object.entries(SIMPLIFIED_RADICALS)) {
      const code = target.codePointAt(0) ?? 0
      // 目标是 CJK 统一表意文字（U+4E00–U+9FFF）
      expect(code, `${radical} → ${target}`).toBeGreaterThanOrEqual(0x4e00)
      expect(code, `${radical} → ${target}`).toBeLessThanOrEqual(0x9fff)
      // 键必须是简化部首区的字符
      expect(radical.codePointAt(0) ?? 0).toBeGreaterThanOrEqual(0x2e80)
      expect(radical.codePointAt(0) ?? 0).toBeLessThanOrEqual(0x2ef3)
    }
  })

  it('兼容字形还原成常用字', async () => {
    const result = await extractPdfText(await pdfFile('resume-text-layer.pdf'))

    expect(result.text).not.toContain('⼯')
    expect(result.text).not.toContain('⽬')
    expect(result.text).toContain('工作经历')
    expect(result.text).toContain('项目经历')
    // 页面里的「页」也是简化部首形态
    expect(result.text).toContain('页面')
  })

  it('没有文字层的 PDF 判为 none', async () => {
    const result = await extractPdfText(await pdfFile('resume-no-text.pdf'))

    expect(result.ok).toBe(true)
    expect(result.quality).toBe('none')
    expect(result.text.trim()).toBe('')
  })

  it('按文件自身判定类型，改名的非 PDF 被拒', async () => {
    const renamed = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'fake.pdf', {
      type: 'application/pdf',
    })
    const result = await extractPdfText(renamed)

    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('not-pdf')
    expect(failureText(result)).toContain('PDF')
  })

  it('超过大小上限的文件被拒', async () => {
    const big = new File([new Uint8Array(MAX_PDF_BYTES + 1)], 'big.pdf')
    const result = await extractPdfText(big)

    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('too-large')
    expect(failureText(result)).toContain('MB')
  })

  it('字节头是 PDF 但内容损坏时报损坏', async () => {
    const broken = new File([new TextEncoder().encode('%PDF-1.4\n这里全是垃圾')], 'broken.pdf')
    const result = await extractPdfText(broken)

    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('corrupted')
    expect(failureText(result)).toContain('读不出来')
  })
})

describe('extractPdfText 的错误分类', () => {
  async function withMockedPdfjs(name: string): Promise<ReturnType<typeof extractPdfText>> {
    vi.resetModules()
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.reject(Object.assign(new Error('mocked'), { name })),
        destroy: async () => {},
      }),
    }))
    const module = await import('./pdfText')
    return module.extractPdfText(await pdfFile('resume-text-layer.pdf'))
  }

  it('有打开口令的 PDF 单独归类', async () => {
    const result = await withMockedPdfjs('PasswordException')

    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('encrypted')
    expect(failureText(result)).toContain('口令')
  })

  it('其它异常归为读不出来', async () => {
    const result = await withMockedPdfjs('SomethingElse')

    expect(result.ok).toBe(false)
    expect(result.failure?.reason).toBe('unknown')
    expect(failureText(result)).toContain('读不出来')
  })
})
