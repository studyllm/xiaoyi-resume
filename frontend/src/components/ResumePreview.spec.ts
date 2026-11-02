// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { DraftProfile } from '@/domain/types'
import ResumePreview, { type PreviewSection } from './ResumePreview.vue'

const SECTIONS: PreviewSection[] = [
  {
    kind: 'experience',
    title: '工作经历',
    id: 'sec-experience',
    items: [
      {
        id: 'item-1',
        org: '美团',
        title: '前端工程师',
        start: '2021-03',
        end: null,
        present: true,
        bullets: [{ id: 'b1', text: '主导活动平台前端架构升级，页面构建时间从 120s 降到 18s' }],
      },
    ],
  },
  {
    kind: 'education',
    title: '教育背景',
    id: 'sec-education',
    items: [
      {
        id: 'item-2',
        org: '清华大学',
        title: '计算机科学与技术',
        start: '2015-09',
        end: '2018-06',
        bullets: [{ id: 'b2', text: '主修数据结构与操作系统' }],
      },
    ],
  },
]

const PROFILE: DraftProfile = {
  name: '张三',
  headline: '前端工程师 · 6 年经验',
  contacts: [{ label: '手机', value: '138-0000-0000' }],
}

describe('ResumePreview', () => {
  it('renders the profile', () => {
    const wrapper = mount(ResumePreview, { props: { sections: SECTIONS, profile: PROFILE } })
    const text = wrapper.text()
    expect(text).toContain('张三')
    expect(text).toContain('前端工程师 · 6 年经验')
    expect(text).toContain('138-0000-0000')
  })

  it('renders every section and bullet', () => {
    const wrapper = mount(ResumePreview, { props: { sections: SECTIONS, profile: PROFILE } })
    const text = wrapper.text()
    expect(text).toContain('工作经历')
    expect(text).toContain('教育背景')
    expect(text).toContain('主导活动平台前端架构升级，页面构建时间从 120s 降到 18s')
    expect(text).toContain('主修数据结构与操作系统')
  })

  it('renders the dates of an entry', () => {
    const wrapper = mount(ResumePreview, { props: { sections: SECTIONS, profile: PROFILE } })
    expect(wrapper.text()).toContain('2021-03 - 至今')
    expect(wrapper.text()).toContain('2015-09 - 2018-06')
  })

  it('does not render any interface chrome of its own', () => {
    const wrapper = mount(ResumePreview, { props: { sections: SECTIONS, profile: PROFILE } })
    const text = wrapper.text()
    expect(text).not.toContain('小奕')
    expect(text).not.toContain('演示模式')
    expect(text).not.toContain('导出')
  })

  it('survives a version that predates the profile field', () => {
    const wrapper = mount(ResumePreview, {
      props: { sections: SECTIONS } as never,
    })
    expect(wrapper.text()).toContain('工作经历')
  })

  it('highlights the problematic fragment inside a bullet', () => {
    const wrapper = mount(ResumePreview, {
      props: {
        sections: SECTIONS,
        profile: PROFILE,
        highlights: [
          { bulletId: 'b1', fragment: '主导活动平台前端架构升级', severity: 'medium' },
        ],
      },
    })
    const mark = wrapper.find('mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('主导活动平台前端架构升级')
    expect(mark.classes()).toContain('is-medium')
  })

  it('highlights the heading of an entry for an entry level issue', () => {
    const wrapper = mount(ResumePreview, {
      props: {
        sections: SECTIONS,
        profile: PROFILE,
        highlights: [{ itemId: 'item-1', severity: 'high' }],
      },
    })
    const heads = wrapper.findAll('.paper-item-head')
    expect(heads[0]!.classes()).toContain('is-marked')
    expect(heads[0]!.classes()).toContain('is-high')
  })

  it('highlights the title of a section for a section level issue', () => {
    const wrapper = mount(ResumePreview, {
      props: {
        sections: SECTIONS,
        profile: PROFILE,
        highlights: [{ sectionId: 'sec-experience', severity: 'low' }],
      },
    })
    const title = wrapper.find('#anchor-section-sec-experience .paper-section-title')
    expect(title.classes()).toContain('is-marked')
    expect(title.classes()).toContain('is-low')
  })

  it('falls back to no fragment highlight when the text no longer contains it', () => {
    const wrapper = mount(ResumePreview, {
      props: {
        sections: SECTIONS,
        profile: PROFILE,
        highlights: [{ bulletId: 'b1', fragment: '已经不在的片段', severity: 'medium' }],
      },
    })
    expect(wrapper.find('mark').exists()).toBe(false)
  })

  it('renders a draft shaped section', () => {
    const draftSection = {
      kind: 'experience' as const,
      title: '工作经历',
      id: 'sec-draft',
      items: [
        {
          id: 'item-d',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          end: null,
          present: true,
          bullets: [{ id: 'bd', text: '负责活动页开发' }],
        },
      ],
    }
    const wrapper = mount(ResumePreview, { props: { sections: [draftSection] } })
    expect(wrapper.text()).toContain('负责活动页开发')
  })

  it('does not render the contacts line when there is none and it is read only', () => {
    const wrapper = mount(ResumePreview, { props: { sections: SECTIONS, profile: { ...PROFILE, contacts: [] } } })
    expect(wrapper.find('.paper-contacts').exists()).toBe(false)
  })

  it('does not render an empty contacts line just because it is editable', () => {
    const wrapper = mount(ResumePreview, {
      props: { sections: SECTIONS, profile: { ...PROFILE, contacts: [] }, editable: true },
    })
    expect(wrapper.find('.paper-contacts').exists()).toBe(false)
  })

  it('keeps the print rules that hide the application chrome', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/ResumePreview.vue'), 'utf8')
    const printBlock = /@media print\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
    expect(printBlock).toContain('.layout-header')
    expect(printBlock).toContain('.layout-aside')
    expect(printBlock).toContain('.layout-banner')
    expect(printBlock).toContain('size: A4')
  })

  it('keeps the print rules that hide the on-paper annotations', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/ResumePreview.vue'), 'utf8')
    const printBlock = /@media print\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
    expect(printBlock).toContain('.paper-comment')
  })

  it('keeps the print rules that drop the edit affordances', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/ResumePreview.vue'), 'utf8')
    const printBlock = /@media print\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
    expect(printBlock).toContain('.resume-editor .paper-item-head')
    expect(printBlock).toContain('.resume-editor .el-input__inner')
    expect(printBlock).toContain('.resume-editor .resume-paper')
  })
})
