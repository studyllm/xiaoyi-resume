// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { EMPTY_STATES } from '@/domain/states'
import EmptyState from './EmptyState.vue'

describe('EmptyState 的三层结构', () => {
  it('标题与说明分开呈现，不挤在同一句里', () => {
    const wrapper = mount(EmptyState, { props: { state: 'no-draft' } })

    expect(wrapper.text()).toContain(EMPTY_STATES['no-draft'].title)
    expect(wrapper.text()).toContain(EMPTY_STATES['no-draft'].hint)
  })

  it('有主动作的状态渲染出按钮，点它把动作抛出去', async () => {
    const wrapper = mount(EmptyState, { props: { state: 'no-draft' } })
    const button = wrapper.find('button')

    expect(button.exists()).toBe(true)
    expect(button.text()).toBe(EMPTY_STATES['no-draft'].action)

    await button.trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('没有主动作的状态不渲染按钮', () => {
    const wrapper = mount(EmptyState, { props: { state: 'no-diff' } })

    expect(EMPTY_STATES['no-diff'].action).toBeUndefined()
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
