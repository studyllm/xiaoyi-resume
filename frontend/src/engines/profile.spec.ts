import { describe, expect, it } from 'vitest'

import { extractProfile } from './profile'

describe('extractProfile', () => {
  it('reads a name, a headline and the labelled contacts', () => {
    const profile = extractProfile([
      '张三',
      '前端工程师 · 6 年经验',
      '手机：138-0000-0000    邮箱：zhangsan@example.com',
    ])

    expect(profile.name).toBe('张三')
    expect(profile.headline).toBe('前端工程师 · 6 年经验')
    expect(profile.contacts).toEqual([
      { label: '手机', value: '138-0000-0000' },
      { label: '邮箱', value: 'zhangsan@example.com' },
    ])
  })

  it('returns an empty profile when there is no header', () => {
    const profile = extractProfile([])
    expect(profile.name).toBe('')
    expect(profile.headline).toBe('')
    expect(profile.contacts).toEqual([])
  })

  it('skips a line that carries a date range', () => {
    const profile = extractProfile(['2021.03 - 至今', '张三'])
    expect(profile.name).toBe('张三')
  })

  it('infers the label of an unlabelled email and phone', () => {
    const profile = extractProfile([
      '张三',
      '前端工程师',
      '138-0000-0000',
      'zhangsan@example.com',
      '这一行与抬头无关',
    ])

    expect(profile.name).toBe('张三')
    expect(profile.headline).toBe('前端工程师')
    expect(profile.contacts).toEqual([
      { label: '手机', value: '138-0000-0000' },
      { label: '邮箱', value: 'zhangsan@example.com' },
    ])
  })

  it('treats a labelled intent as the headline rather than a contact', () => {
    const profile = extractProfile(['求职意向：前端工程师', '手机：138-0000-0000'])
    expect(profile.headline).toBe('前端工程师')
    expect(profile.contacts).toEqual([{ label: '手机', value: '138-0000-0000' }])
  })

  it('keeps every labelled field as a contact', () => {
    const profile = extractProfile(['微信：zhangsan', 'GitHub：github.com/zhangsan'])
    expect(profile.contacts).toEqual([
      { label: '微信', value: 'zhangsan' },
      { label: 'GitHub', value: 'github.com/zhangsan' },
    ])
  })
})
