// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PaperField from './PaperField.vue'

describe('PaperField', () => {
  it('renders the value as text when it is not editable', () => {
    const wrapper = mount(PaperField, {
      props: { editable: false, value: '美团' },
    })
    expect(wrapper.text()).toBe('美团')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('renders an input when it is editable', () => {
    const wrapper = mount(PaperField, {
      props: { editable: true, value: '美团' },
    })
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('input').element.value).toBe('美团')
  })

  it('emits the new value when the input changes', async () => {
    const wrapper = mount(PaperField, {
      props: { editable: true, value: '美团' },
    })
    await wrapper.find('input').setValue('字节跳动')
    expect(wrapper.emitted('update')?.[0]).toEqual(['字节跳动'])
  })

  it('shows a placeholder only when editable', () => {
    const editable = mount(PaperField, {
      props: { editable: true, value: '', placeholder: '公司或机构' },
    })
    expect(editable.find('input').attributes('placeholder')).toBe('公司或机构')

    const readonly = mount(PaperField, {
      props: { editable: false, value: '', placeholder: '公司或机构' },
    })
    expect(readonly.find('input').exists()).toBe(false)
  })

  it('applies the variant to the rendered text', () => {
    const wrapper = mount(PaperField, {
      props: { editable: false, value: '张三', variant: 'name' },
    })
    expect(wrapper.find('.paper-field--text').attributes('style')).toContain('18pt')
  })
})
