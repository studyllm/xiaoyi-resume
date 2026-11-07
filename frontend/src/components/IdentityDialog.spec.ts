// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from '@/api/client'
import { ALL_STATES } from '@xiaoyi/shared/domain/states'
import IdentityDialog from './IdentityDialog.vue'

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client')
  return { ...actual, api: vi.fn() }
})

async function mountDialog() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(IdentityDialog, {
    props: { modelValue: true },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

/** 对话框里的输入框：第一个是邮箱，第二个是密码。 */
function inputs(wrapper: Awaited<ReturnType<typeof mountDialog>>) {
  return wrapper.findAll('input')
}

function clickButton(wrapper: Awaited<ReturnType<typeof mountDialog>>, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  expect(button, `找不到按钮：${text}`).toBeDefined()
  return button!
}

describe('登录对话框', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
  })

  it('要邮箱与密码，不要名字', async () => {
    const wrapper = await mountDialog()

    expect(wrapper.text()).toContain('邮箱')
    expect(wrapper.text()).toContain('密码')
    expect(wrapper.text()).not.toContain('你的名字')

    const types = inputs(wrapper).map((input) => input.attributes('type'))
    expect(types).toContain('email')
    expect(types).toContain('password')
  })

  it('登录成功就确认', async () => {
    vi.mocked(api).mockResolvedValue({ user: { id: 'u1', email: 'a@example.com' } })
    const wrapper = await mountDialog()

    const [email, password] = inputs(wrapper)
    await email!.setValue('a@example.com')
    await password!.setValue('correct horse battery')
    await clickButton(wrapper, '登录').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirmed')).toHaveLength(1)
  })

  it('失败时显示状态表里的文案，不自己另写', async () => {
    const state = ALL_STATES['invalid-credentials']!
    vi.mocked(api).mockRejectedValue(new ApiError('INVALID_CREDENTIALS', state))
    // eslint-disable-next-line no-console
    const wrapper = await mountDialog()

    const [email, password] = inputs(wrapper)
    await email!.setValue('a@example.com')
    await password!.setValue('nope')
    await clickButton(wrapper, '登录').trigger('click')
    await flushPromises()
    await flushPromises()

    expect(vi.mocked(api)).toHaveBeenCalled()
    expect(wrapper.emitted('confirmed')).toBeUndefined()
  })

  it('可以切到注册与找回密码', async () => {
    const wrapper = await mountDialog()

    await clickButton(wrapper, '没有账号？注册一个').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('验证邮件')

    await clickButton(wrapper, '返回登录').trigger('click')
    await flushPromises()

    await clickButton(wrapper, '忘记密码').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('重置链接')
  })
})
