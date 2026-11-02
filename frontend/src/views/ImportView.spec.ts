// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import IdentityDialog from '@/components/IdentityDialog.vue'
import { extractPdfText } from '@/engines/pdfText'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import type { Draft } from '@/domain/types'
import ImportView from './ImportView.vue'

const RESUME = `工作经历
美团 前端工程师 2021.03 - 至今
· 主导活动平台前端架构升级
`

const RESUME_MISSING_TIME = `工作经历
美团 前端工程师
· 负责活动平台的前端开发
`

async function mountImporter(loggedIn = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (loggedIn) useSessionStore().login('张三')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import', component: ImportView },
      { path: '/draft', component: { template: '<div />' } },
    ],
  })
  await router.push('/import')
  await router.isReady()

  const wrapper = mount(ImportView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, store: useDraftStore() }
}

type Importer = Awaited<ReturnType<typeof mountImporter>>

async function parse(wrapper: Importer['wrapper'], text: string) {
  await wrapper.find('textarea').setValue(text)
  const button = wrapper.findAll('button').find((node) => node.text().includes('解析'))!
  await button.trigger('click')
  await flushPromises()
}

describe('ImportView 的解析结果', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('解析之后用纸呈现解析结果', async () => {
    const { wrapper } = await mountImporter()
    expect(wrapper.find('.resume-paper').exists()).toBe(false)

    await parse(wrapper, RESUME)

    expect(wrapper.find('.resume-paper').exists()).toBe(true)
    // 字段是输入框，值不在 text() 里
    const orgInput = wrapper.find('.resume-paper .paper-org input').element as HTMLInputElement
    expect(orgInput.value).toBe('美团')
    expect(wrapper.text()).toContain('主导活动平台前端架构升级')
    // 旧的那套弱渲染没了
    expect(wrapper.find('.preview-item').exists()).toBe(false)
  })

  it('可以在纸上直接改公司名', async () => {
    const { wrapper, store } = await mountImporter()
    await parse(wrapper, RESUME)

    const orgInput = wrapper.find('.resume-paper .paper-org input')
    await orgInput.setValue('字节跳动')
    await flushPromises()

    const experience = store.pending!.sections.find((entry) => entry.kind === 'experience')!
    expect(experience.items[0]!.org).toBe('字节跳动')
  })

  it('解析之后列出结构问题', async () => {
    const { wrapper } = await mountImporter()
    await parse(wrapper, RESUME_MISSING_TIME)

    const alert = wrapper.findAll('.el-alert').find((node) => node.text().includes('结构问题'))!
    expect(alert).toBeDefined()
    expect(alert!.text()).toContain('缺少开始时间')
    expect(alert!.text()).toContain('工作经历')
  })

  it('没有要紧的结构问题时不列清单', async () => {
    const { wrapper } = await mountImporter()
    await parse(wrapper, RESUME)

    const alerts = wrapper.findAll('.el-alert').map((node: { text: () => string }) => node.text())
    expect(alerts.some((text) => text.includes('结构问题'))).toBe(false)
  })

  it('保存按钮在纸旁边', async () => {
    const { wrapper } = await mountImporter()
    await parse(wrapper, RESUME)

    const header = wrapper.find('.result-header')
    expect(header.exists()).toBe(true)
    expect(header.findAll('button').some((node) => node.text().includes('保存'))).toBe(true)
  })
})

describe('ImportView 的身份时机', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('未登录也能粘贴并解析，全程不问身份', async () => {
    const { wrapper } = await mountImporter(false)
    await parse(wrapper, RESUME)

    expect(wrapper.find('.resume-paper').exists()).toBe(true)
    expect(wrapper.findComponent(IdentityDialog).props('modelValue')).toBe(false)
    expect(useSessionStore().isLoggedIn).toBe(false)
  })

  it('未登录点保存时先问身份，确认后这次保存继续', async () => {
    const { wrapper, store } = await mountImporter(false)
    await parse(wrapper, RESUME)

    const save = wrapper.findAll('button').find((node) => node.text().includes('保存'))!
    await save.trigger('click')
    await flushPromises()

    // 身份对话框被打开，还没有保存
    expect(wrapper.findComponent(IdentityDialog).props('modelValue')).toBe(true)
    expect(store.hasDraft).toBe(false)

    const dialog = wrapper.findComponent(IdentityDialog)
    await dialog.findAllComponents({ name: 'ElInput' })[0]!.setValue('张三')
    const confirm = dialog
      .findAllComponents({ name: 'ElButton' })
      .find((node) => node.text().includes('保存到我的简历'))!
    await confirm.trigger('click')
    await flushPromises()

    expect(useSessionStore().isLoggedIn).toBe(true)
    expect(store.hasDraft).toBe(true)
  })
})

async function pdfFile(name: string): Promise<File> {
  // 用 cwd 而不是 import.meta.url——jsdom 环境下后者不是 file URL
  const buffer = await readFile(resolve(process.cwd(), 'src/mock', name))
  return new File([new Uint8Array(buffer)], name, { type: 'application/pdf' })
}

async function upload(wrapper: Importer['wrapper'], file: File) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], writable: true })
  await input.trigger('change')
  await flushPromises()
}

/** 底稿里可比对的结构：分区、条目、要点。 */
function shape(draft: Draft | null): unknown {
  return draft?.sections.map((section) => ({
    kind: section.kind,
    items: section.items.map((item) => ({
      org: item.org,
      title: item.title,
      start: item.start,
      end: item.end,
      bullets: item.bullets.map((bullet) => bullet.text),
    })),
  }))
}

describe('ImportView 的上传路径', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('上传可解析的 PDF 后纸上出现解析结果', async () => {
    const { wrapper } = await mountImporter()
    expect(wrapper.find('.resume-paper').exists()).toBe(false)

    await upload(wrapper, await pdfFile('resume-text-layer.pdf'))

    // 提取是异步的，等它落到纸上
    await vi.waitFor(() => expect(wrapper.find('.resume-paper').exists()).toBe(true), {
      timeout: 5000,
    })
    const orgInput = wrapper.find('.resume-paper .paper-org input').element as HTMLInputElement
    expect(orgInput.value).toBe('清华大学')
    expect(wrapper.text()).toContain('主导动平台前端架构升级')
  })

  it('上传路径与粘贴路径产出同一条底稿', async () => {
    const extracted = await extractPdfText(await pdfFile('resume-text-layer.pdf'))

    const byUpload = await mountImporter()
    await upload(byUpload.wrapper, await pdfFile('resume-text-layer.pdf'))
    await vi.waitFor(
      () => expect(useDraftStore().pending).not.toBeNull(),
      { timeout: 5000 },
    )
    const uploaded = shape(useDraftStore().pending)

    const byPaste = await mountImporter()
    await parse(byPaste.wrapper, extracted.text)
    const pasted = shape(useDraftStore().pending)

    expect(uploaded).toEqual(pasted)
    expect(uploaded).toBeTruthy()
  })

  it('文字很少时给出警告，并把读到的内容交给用户', async () => {
    const { wrapper } = await mountImporter()
    await upload(wrapper, await pdfFile('resume-sparse-text.pdf'))

    await vi.waitFor(
      () => {
        const alert = wrapper.findAll('.el-alert').find((node) => node.text().includes('文字很少'))
        expect(alert).toBeDefined()
      },
      { timeout: 5000 },
    )
    const alert = wrapper.findAll('.el-alert').find((node) => node.text().includes('文字很少'))!
    expect(alert.text()).toContain('扫描件')
    // 读到的文字已经放进输入框，用户能接着改
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).not.toBe('')
  })

  it('没有文字层时说明原因并切到粘贴页签', async () => {
    const { wrapper } = await mountImporter()
    await upload(wrapper, await pdfFile('resume-no-text.pdf'))

    await vi.waitFor(
      () => {
        const alert = wrapper.findAll('.el-alert').find((node) => node.text().includes('没有可读取的文字层'))
        expect(alert).toBeDefined()
      },
      { timeout: 5000 },
    )
    expect(wrapper.find('.resume-paper').exists()).toBe(false)
    const active = wrapper.findAll('.el-tabs__item').find((node) => node.classes().includes('is-active'))
    expect(active?.text()).toContain('粘贴文本')
  })

  it('上传的不是 PDF 时说清原因', async () => {
    const { wrapper } = await mountImporter()
    const fake = new File([new Uint8Array([1, 2, 3, 4, 5])], 'fake.pdf', {
      type: 'application/pdf',
    })
    await upload(wrapper, fake)

    await vi.waitFor(
      () => {
        const alert = wrapper.findAll('.el-alert').find((node) => node.text().includes('不是 PDF'))
        expect(alert).toBeDefined()
      },
      { timeout: 5000 },
    )
    expect(wrapper.find('.resume-paper').exists()).toBe(false)
  })

  it('上传占位文案不再出现', async () => {
    const { wrapper } = await mountImporter()
    expect(wrapper.text()).not.toContain('暂不支持 PDF 解析')
  })
})
