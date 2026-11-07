import { describe, expect, it } from 'vitest'

import type { ResumeVersion } from '../domain/types'
import { renderMarkdown } from './markdown'

const VERSION: ResumeVersion = {
  id: 'version-1',
  userId: 'user-1',
  name: '前端工程师',
  profile: {
    name: '张三',
    headline: '前端工程师 · 6 年经验',
    contacts: [
      { label: '手机', value: '138-0000-0000' },
      { label: '邮箱', value: 'zhangsan@example.com' },
    ],
  },
  jdRawText: '',
  jdRoleName: '前端工程师',
  draftRevision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  body: '',
  sections: [
    {
      kind: 'experience',
      title: '工作经历',
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
  ],
  diff: [],
  uncovered: [],
  coverage: [],
  integrity: { checked: 0, violations: [] },
  engineVersion: 'test',
}

describe('renderMarkdown', () => {
  it('puts the profile at the top', () => {
    const markdown = renderMarkdown(VERSION)
    expect(markdown).toContain('# 张三')
    expect(markdown).toContain('前端工程师 · 6 年经验')
    expect(markdown).toContain('138-0000-0000')
  })

  it('renders each section as a second level heading', () => {
    const markdown = renderMarkdown(VERSION)
    expect(markdown).toContain('## 工作经历')
    expect(markdown).toContain('## 教育背景')
    expect(markdown).not.toContain('### ')
  })

  it('renders an entry as one line starting with the bold organisation', () => {
    const markdown = renderMarkdown(VERSION)
    expect(markdown).toContain('**美团** · 前端工程师 · 2021-03 - 至今')
  })

  it('renders bullets as an unordered list', () => {
    const markdown = renderMarkdown(VERSION)
    expect(markdown).toContain('- 主导活动平台前端架构升级，页面构建时间从 120s 降到 18s')
  })

  it('keeps the same date format as the plain text body', () => {
    const markdown = renderMarkdown(VERSION)
    expect(markdown).toContain('2015-09 - 2018-06')
  })

  it('skips empty sections', () => {
    const markdown = renderMarkdown({ ...VERSION, sections: [VERSION.sections[0]!] })
    expect(markdown).not.toContain('## 教育背景')
  })

  it('renders an entry without a title', () => {
    const markdown = renderMarkdown({
      ...VERSION,
      sections: [
        {
          kind: 'project',
          title: '项目经历',
          items: [
            {
              id: 'item-3',
              org: '经营数据可视化大屏',
              start: '2022-05',
              end: '2022-11',
              bullets: [{ id: 'b3', text: '使用 Vue 与 ECharts 实现大屏' }],
            },
          ],
        },
      ],
    })
    expect(markdown).toContain('**经营数据可视化大屏** · 2022-05 - 2022-11')
  })
})
