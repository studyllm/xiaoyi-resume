// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSessionStore } from '@/stores/session'
import IdentityDialog, { type IdentityReason } from './IdentityDialog.vue'

async function mountDialog(reason: IdentityReason = 'continue', lastName = '') {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (lastName) useSessionStore().login(lastName)
  const wrapper = mount(IdentityDialog, {
    props: { modelValue: true, reason },
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
  // 对话框内容是异步渲染的，等它出来再操作
  await flushPromises()
  return wrapper
}

type DialogWrapper = Awaited<ReturnType<typeof mountDialog>>

async function submit(wrapper: DialogWrapper): Promise<void> {
  const button = wrapper.findAllComponents({ name: 'ElButton' }).find((item) =>
    item.text().includes('继续') || item.text().includes('保存'),
  )
  if (!button) throw new Error('找不到提交按钮')
  await button.trigger('click')
  await flushPromises()
  // 表单项的错误提示有 100ms 的防抖，等它渲染出来
  await new Promise((resolve) => setTimeout(resolve, 150))
  await flushPromises()
}

describe('身份对话框', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('只问名字，没有密码输入项', async () => {
    const wrapper = await mountDialog()
    expect(wrapper.findAllComponents({ name: 'ElInput' })).toHaveLength(1)
    expect(document.body.textContent).not.toContain('密码')
  })

  it('名字为空时给出错误，不建立登录态', async () => {
    const wrapper = await mountDialog()
    await submit(wrapper)

    expect(useSessionStore().isLoggedIn).toBe(false)
    expect(document.body.textContent).toContain('请填写名字')
  })

  it('填了名字就能建立登录态并通知调用方', async () => {
    const wrapper = await mountDialog()
    const inputs = wrapper.findAllComponents({ name: 'ElInput' })
    await inputs[0]!.setValue('张三')
    await submit(wrapper)

    expect(useSessionStore().isLoggedIn).toBe(true)
    expect(useSessionStore().user?.username).toBe('张三')
    expect(wrapper.emitted('confirmed')).toHaveLength(1)
  })

  it('打开时预填上次用过的名字', async () => {
    const wrapper = await mountDialog('continue', '张三')
    const input = wrapper.findAllComponents({ name: 'ElInput' })[0]!
    expect(input.props('modelValue')).toBe('张三')
  })

  it('没有用过的名字时输入框是空的', async () => {
    const wrapper = await mountDialog('continue')
    const input = wrapper.findAllComponents({ name: 'ElInput' })[0]!
    expect(input.props('modelValue')).toBe('')
  })

  it('保存场景说的是这份简历归你', async () => {
    await mountDialog('save')
    expect(document.body.textContent).toContain('这份简历归你')
    expect(document.body.textContent).toContain('只存在这台设备上')
  })

  it('继续场景说的是留个名字就能继续', async () => {
    await mountDialog('continue')
    expect(document.body.textContent).toContain('留个名字就能继续')
    expect(document.body.textContent).toContain('不需要注册账号')
  })
})
