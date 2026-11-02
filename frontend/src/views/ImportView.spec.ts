// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import IdentityDialog from '@/components/IdentityDialog.vue'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
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
