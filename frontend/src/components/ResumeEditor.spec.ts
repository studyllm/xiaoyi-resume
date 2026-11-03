// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DiagnosisIssue, Draft } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
import ResumeEditor from './ResumeEditor.vue'

function makeDraft(): Draft {
  return {
    id: 'draft-1',
    userId: 'user-1',
    revision: 1,
    profile: {
      name: '张三',
      headline: '前端工程师 · 6 年经验',
      contacts: [{ label: '手机', value: '138-0000-0000' }],
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: SECTION_ORDER.map((kind) => ({
      id: `sec-${kind}`,
      kind,
      title: SECTION_TITLES[kind],
      items:
        kind === 'experience'
          ? [
              {
                id: 'item-1',
                org: '美团',
                title: '前端工程师',
                start: '2021-03',
                end: null,
                present: true,
                bullets: [{ id: 'bullet-1', text: '主导活动平台前端架构升级' }],
              },
            ]
          : kind === 'education'
            ? [
                {
                  id: 'edu-1',
                  org: '清华大学',
                  title: '计算机科学与技术',
                  start: '2014-09',
                  end: '2018-06',
                  present: false,
                  bullets: [{ id: 'bullet-2', text: '主修数据结构与操作系统' }],
                },
              ]
            : kind === 'skills'
              ? [{ id: 'skill-item', bullets: [{ id: 'bullet-3', text: 'Vue' }] }]
              : [],
    })),
  }
}

function issue(overrides: Partial<DiagnosisIssue> = {}): DiagnosisIssue {
  return {
    id: 'vague@bullet-1',
    ruleId: 'vague',
    category: 'vague',
    severity: 'medium',
    sectionId: 'sec-experience',
    sectionKind: 'experience',
    sectionTitle: '工作经历',
    itemId: 'item-1',
    itemLabel: '美团 · 前端工程师',
    bulletId: 'bullet-1',
    quote: '参与团队协作与日常维护',
    highlight: '团队协作',
    problem: '这句用的是笼统评价，没有具体技术名词，也没有可衡量的结果。',
    suggestion: '换成具体的技术名词和结果。',
    ...overrides,
  }
}

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(ResumeEditor, {
    props: { draft: makeDraft(), editable: true, ...props },
    attachTo: document.body,
  })
}

/** 最后一次改动之后的那份简历。 */
function changedDraft(wrapper: ReturnType<typeof mountEditor>): Draft {
  const events = wrapper.emitted('change')
  expect(events).toBeTruthy()
  return events![events!.length - 1]![0] as Draft
}

function buttonByText(wrapper: ReturnType<typeof mountEditor>, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) throw new Error(`找不到按钮：${text}`)
  return found
}

/**
 * 纸面样式的全部来源。
 *
 * 拆分之后，联系���、日期、行内批注这几块的样式跟着各自的组件走了——父组件的
 * 样式文件里只剩 `:deep()` 形式的跨组件规则。断言要看的是「这些规则还在
 * 不在」，所以把两边都读进来。
 */
function editorStyles(): string {
  const files = [
    'src/components/resume-editor.css',
    'src/components/ContactList.vue',
    'src/components/ItemDates.vue',
    'src/components/BulletComments.vue',
    'src/components/DeleteButton.vue',
  ]
  return files.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n')
}

describe('ResumeEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Element.prototype.scrollIntoView = () => {}
  })

  it('groups the name and contacts under a basic-info heading in both modes', () => {
    const editing = mountEditor({ editable: true })
    const title = editing.find('.paper-profile-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('基础信息')
    expect(title.classes()).toContain('paper-section-title')
    expect(editing.find('.paper-header').element.contains(title.element)).toBe(true)

    const readonly = mountEditor({ editable: false })
    const previewTitle = readonly.find('.paper-profile-title')
    expect(previewTitle.exists()).toBe(true)
    expect(previewTitle.text()).toBe('基础信息')
    expect(previewTitle.classes()).toContain('paper-section-title')
    expect(readonly.text()).toContain('张三')
  })

  it('renders the resume as text when it is not editable', () => {
    const wrapper = mountEditor({ editable: false })
    expect(wrapper.text()).toContain('美团')
    expect(wrapper.find('.paper-field--input').exists()).toBe(false)
  })

  it('renders the fields as inputs when it is editable', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('.paper-field--input').exists()).toBe(true)
  })

  it('reports the new text of a bullet', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-bullet-bullet-1 .paper-bullet-text').trigger('click')
    await flushPromises()

    await wrapper.find('#bullet-input-bullet-1').setValue('改过的要点')
    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'experience')!.items[0]!.bullets[0]!.text).toBe(
      '改过的要点',
    )
  })

  it('reports the new company of an entry', async () => {
    const wrapper = mountEditor()
    const orgInput = wrapper.find('#anchor-item-item-1 .paper-org input')
    await orgInput.setValue('字节跳动')

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'experience')!.items[0]!.org).toBe('字节跳动')
  })

  it('adds a bullet under the entry', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-item-item-1 .paper-add').trigger('click')
    await flushPromises()

    const next = changedDraft(wrapper)
    const bullets = next.sections.find((section) => section.kind === 'experience')!.items[0]!.bullets
    expect(bullets).toHaveLength(2)
    expect(bullets[1]!.text).toBe('')
  })

  it('adds an entry and puts the focus on its first field', async () => {
    const wrapper = mountEditor()
    await buttonByText(wrapper, '＋ 新增一个项目').trigger('click')
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'project')!.items).toHaveLength(1)
    expect(document.activeElement).not.toBeNull()
  })

  it('adds a skill as a row instead of a new entry', async () => {
    const wrapper = mountEditor()
    await buttonByText(wrapper, '＋ 新增一条技能').trigger('click')
    await flushPromises()

    const next = changedDraft(wrapper)
    const skills = next.sections.find((section) => section.kind === 'skills')!
    expect(skills.items).toHaveLength(1)
    expect(skills.items[0]!.bullets).toHaveLength(2)
  })

  it('asks before deleting a bullet', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-bullet-bullet-1 .paper-action button').trigger('click')
    await flushPromises()
    expect(wrapper.find('#anchor-bullet-bullet-1').text()).toContain('确认删除')
    expect(wrapper.emitted('change')).toBeFalsy()
  })

  it('removes the bullet once the deletion is confirmed', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-bullet-bullet-1 .paper-action button').trigger('click')
    await flushPromises()
    await wrapper.find('#anchor-bullet-bullet-1 .paper-action button').trigger('click')
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'experience')!.items[0]!.bullets).toHaveLength(0)
  })

  it('removes an empty bullet when it loses the focus', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-item-item-1 .paper-add').trigger('click')
    await flushPromises()

    const added = changedDraft(wrapper)
      .sections.find((section) => section.kind === 'experience')!
      .items[0]!.bullets[1]!
    const textarea = document.getElementById(`bullet-input-${added.id}`)
    expect(textarea).not.toBeNull()
    textarea!.dispatchEvent(new Event('blur'))
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'experience')!.items[0]!.bullets).toHaveLength(1)
  })

  it('removes an empty entry when it loses the focus', async () => {
    const wrapper = mountEditor()
    await buttonByText(wrapper, '＋ 新增一个项目').trigger('click')
    await flushPromises()
    const item = changedDraft(wrapper).sections.find((section) => section.kind === 'project')!.items[0]!

    const input = wrapper.find(`#anchor-item-${item.id} input`)
    ;(input.element as HTMLElement).blur()
    await wrapper.find(`#anchor-item-${item.id}`).trigger('focusout')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'project')!.items).toHaveLength(0)
  })

  it('asks the education section for a school and a major', () => {
    const wrapper = mountEditor()
    const education = wrapper
      .findAll('.paper-section')
      .find((entry) => entry.text().includes('教育背景'))!
    const placeholders = education.findAll('input').map((input) => input.attributes('placeholder'))
    expect(placeholders).toContain('学校名称')
    expect(placeholders).toContain('专业')
    expect(placeholders).not.toContain('公司或机构')
  })

  it('asks the experience section for a company and a title', () => {
    const wrapper = mountEditor()
    const experience = wrapper
      .findAll('.paper-section')
      .find((entry) => entry.text().includes('工作经历'))!
    const placeholders = experience.findAll('input').map((input) => input.attributes('placeholder'))
    expect(placeholders).toContain('公司名称')
    expect(placeholders).toContain('职位')
  })

  it('does not ask the skills section for a company or a title', () => {
    const wrapper = mountEditor()
    const skills = wrapper.findAll('.paper-section').find((entry) => entry.text().includes('专业技能'))!
    expect(skills.findAll('.paper-org')).toHaveLength(0)
    expect(skills.findAll('.paper-title')).toHaveLength(0)
    expect(skills.findAll('.paper-dates')).toHaveLength(0)
    expect(skills.findAll('.paper-item-head')).toHaveLength(0)
  })


  it('shows no inline comments when there are no comments', () => {
    const wrapper = mountEditor({ issues: [] })
    expect(wrapper.findAll('.paper-comment')).toHaveLength(0)
  })


  it('shows the comments of a bullet as a single line', async () => {
    const wrapper = mountEditor({ issues: [issue()] })
    expect(wrapper.find('.draft-paper-area .comment').exists()).toBe(false)

    await wrapper.find('.comment-strip').trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('.comment-inline-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('笼统评价')
  })

  it('reports the comment the user clicked on', async () => {
    const wrapper = mountEditor({ issues: [issue()] })
    await wrapper.find('.comment-strip').trigger('click')
    await flushPromises()
    await wrapper.find('.comment-inline-row').trigger('click')

    const events = wrapper.emitted('select-comment')
    expect(events).toHaveLength(1)
    expect((events![0]![0] as DiagnosisIssue).id).toBe('vague@bullet-1')
  })


  it('asks the page to save on Cmd+Enter', async () => {
    const wrapper = mountEditor()
    await wrapper.find('.resume-editor').trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('save-request')).toHaveLength(1)
  })

  it('opens the comment it is told to focus on', async () => {
    const wrapper = mountEditor({
      issues: [issue()],
      focusTarget: { type: 'comment', id: 'vague@bullet-1' },
    })
    await flushPromises()
    expect(wrapper.find('.comment-inline-row').exists()).toBe(true)
  })

  it('cancels an empty entry with Esc', async () => {
    const wrapper = mountEditor()
    await buttonByText(wrapper, '＋ 新增一个项目').trigger('click')
    await flushPromises()

    await wrapper.find('.resume-editor').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'project')!.items).toHaveLength(0)
  })

  it('adds a bullet when the user presses Enter in a bullet', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-bullet-bullet-1 .paper-bullet-text').trigger('click')
    await flushPromises()

    await wrapper.find('#bullet-input-bullet-1').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'experience')!.items[0]!.bullets).toHaveLength(2)
  })

  it('shows only a summary line for the comments of a bullet', () => {
    const wrapper = mountEditor({ issues: [issue()] })
    expect(wrapper.find('.comment-strip').exists()).toBe(true)
    expect(wrapper.find('.comment').exists()).toBe(false)
  })

  it('removes an entry together with its bullets', async () => {
    const wrapper = mountEditor()
    await wrapper.find('#anchor-item-item-1 .paper-action button').trigger('click')
    await flushPromises()
    await wrapper.find('#anchor-item-item-1 .paper-action button').trigger('click')
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.sections.find((section) => section.kind === 'experience')!.items).toHaveLength(0)
  })

  it('keeps the add-contact control outside the shaded header', () => {
    const wrapper = mountEditor()
    const button = buttonByText(wrapper, '新增联系方式')
    expect(button.classes()).toContain('paper-add')
    expect(wrapper.find('.paper-header').element.contains(button.element)).toBe(false)
  })

  it('adds the first contact when there is none', async () => {
    const draft = makeDraft()
    draft.profile.contacts = []
    const wrapper = mountEditor({ draft })

    expect(wrapper.findAll('.paper-contact')).toHaveLength(0)
    await buttonByText(wrapper, '新增联系方式').trigger('click')
    await flushPromises()

    const next = changedDraft(wrapper)
    expect(next.profile.contacts).toHaveLength(1)
    expect(wrapper.findAll('.paper-contact')).toHaveLength(1)
  })

  it('adds and removes a contact', async () => {
    const wrapper = mountEditor()
    await buttonByText(wrapper, '新增联系方式').trigger('click')
    await flushPromises()
    expect(changedDraft(wrapper).profile.contacts).toHaveLength(2)

    // 删除要二次确认：先点垃圾桶，再点「确认删除？」
    await wrapper.findAll('.paper-contact .paper-delete').at(-1)!.trigger('click')
    await flushPromises()
    expect(changedDraft(wrapper).profile.contacts).toHaveLength(2)

    await wrapper.findAll('button').find((b) => b.text().includes('确认删除？'))!.trigger('click')
    await flushPromises()
    expect(changedDraft(wrapper).profile.contacts).toHaveLength(1)
  })

  it('删除入口一律是垃圾桶图标，且一直显形', () => {
    const wrapper = mountEditor()
    const icons = wrapper.findAll('.paper-delete')
    // 联系方式、条目、要点三处
    expect(icons.length).toBeGreaterThanOrEqual(3)
    for (const icon of icons) {
      expect(icon.find('.el-icon').exists()).toBe(true)
      expect(icon.text().trim()).toBe('')
    }
  })

  it('点删除图标先进入确认态，取消后恢复', async () => {
    const wrapper = mountEditor()
    const item = wrapper.find('#anchor-item-item-1 .paper-delete')
    expect(item.exists()).toBe(true)

    await item.trigger('click')
    await flushPromises()
    expect(wrapper.find('#anchor-item-item-1').text()).toContain('确认删除？')

    await wrapper.findAll('button').find((b) => b.text().includes('取消'))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('#anchor-item-item-1').text()).not.toContain('确认删除？')
  })

  it('disables the end date when the entry is still ongoing', async () => {
    const wrapper = mountEditor()
    const dateInputs = () => wrapper.findAll('.paper-date-field input')
    expect(dateInputs().length).toBeGreaterThanOrEqual(2)

    await wrapper.find('.paper-present input').setValue(true)
    await flushPromises()

    expect(dateInputs()[1]!.attributes('disabled')).toBeDefined()
  })

  it('does not mark the structure problems on the paper', () => {
    const draft = makeDraft()
    const experience = draft.sections.find((section) => section.kind === 'experience')!
    experience.items[0]!.start = null

    const wrapper = mountEditor({ draft })
    expect(wrapper.findAll('.paper-marker')).toHaveLength(0)
  })

  it('puts the cursor into the field it is told to focus on', async () => {
    const wrapper = mountEditor({
      focusTarget: { type: 'field', sectionId: 'sec-experience', itemId: 'item-1', field: 'title' },
    })
    await flushPromises()

    const titleInput = wrapper.find('#anchor-item-item-1 .paper-title input').element
    expect(document.activeElement).toBe(titleInput)
  })

  it('marks the paper as editable only in edit mode', () => {
    const editable = mountEditor({ editable: true })
    expect(editable.find('.resume-editor').classes()).toContain('is-editable')

    const readonly = mountEditor({ editable: false })
    expect(readonly.find('.resume-editor').classes()).not.toContain('is-editable')
  })

  it('tells on the paper where the editable parts are', () => {
    const source = editorStyles()
    // 可编辑的块：一层极淡的底色
    expect(source).toContain('.resume-editor.is-editable :deep(.paper-item-head)')
    expect(source).toContain('.resume-editor.is-editable :deep(.paper-bullets li)')
    expect(source).toContain('background: var(--ink-80)')
    // 可编辑的字段：一条极淡的虚线
    expect(source).toContain('text-decoration: underline dashed var(--ink-150)')
    // 聚焦有反馈
    expect(source).toContain('box-shadow: var(--shadow-focus)')
    // 纸面外圈的编辑态标记
    expect(source).toContain('outline: 1px dashed var(--ink-150)')
  })

  it('keeps the delete button on the bullet line, above the inline comments', () => {
    const wrapper = mountEditor({ issues: [issue()] })
    const children = Array.from(wrapper.find('#anchor-bullet-bullet-1').element.children).map(
      (el) => el.className,
    )
    expect(children.indexOf('paper-action')).toBeGreaterThanOrEqual(0)
    expect(children.indexOf('paper-action')).toBeLessThan(children.indexOf('paper-comment'))
  })

  it('keeps the comment strip inside the width of the bullet', () => {
    const source = editorStyles()
    // 左边缩进 14px，宽度要跟着减，不然「展开」会挂到版心外面
    expect(source).toContain('width: calc(100% - 14px)')
  })

  it('indents the add-a-bullet button inside an entry, and only that one', () => {
    const wrapper = mountEditor()
    const nested = wrapper.findAll('.paper-add--nested')
    expect(nested.length).toBeGreaterThan(0)
    expect(nested.every((node) => node.text().includes('新增一条要点'))).toBe(true)

    // 分区末尾的那个（含专业技能的「新增一条技能」）保持分区级
    const sectionAdds = wrapper
      .findAll('.paper-add')
      .filter((node) => !node.classes().includes('paper-add--nested'))
    expect(sectionAdds.length).toBeGreaterThan(0)
    expect(sectionAdds.every((node) => !node.text().includes('新增一条要点'))).toBe(true)
  })

  it('lines the nested add button up with the bullet text', () => {
    const source = editorStyles()
    // 9mm = 要点的缩进（ul 5mm + li 4mm）
    expect(source).toContain('width: calc(100% - 9mm)')
    expect(source).toContain('margin-left: 9mm')
  })

  it('lets a contact value use the rest of the line', () => {
    const source = editorStyles()
    expect(source).toContain('.paper-contact .paper-input:not(.paper-input--label)')
    expect(source).toContain('flex: 1 1 auto')
    expect(source).not.toContain('width: 190px')
  })

  it('lights up only the hovered row of the header', () => {
    const source = editorStyles()
    // 抬头装着四行，hover 不能挂在整块上
    expect(source).not.toContain(':deep(.paper-header:hover)')
    expect(source).toContain(':deep(.paper-name:hover)')
    expect(source).toContain(':deep(.paper-headline:hover)')
    expect(source).toContain(':deep(.paper-contact:hover)')
  })

  it('gives a new bullet an identifier that does not clash with a new draft', async () => {
    const wrapper = mountEditor({ draft: makeDraft() })
    await wrapper.find('#anchor-item-item-1 .paper-add').trigger('click')
    await flushPromises()
    const added = changedDraft(wrapper).sections.find((s) => s.kind === 'experience')!.items[0]!
      .bullets[1]!

    // 换一份新的 draft（比如重新解析），它的标识跟刚加的那条重了
    const second = makeDraft()
    const experience = second.sections.find((s) => s.kind === 'experience')!
    experience.items[0]!.bullets = [
      ...experience.items[0]!.bullets,
      { id: added.id, text: '另一份简历里的内容' },
    ]
    await wrapper.setProps({ draft: second })

    await wrapper.find('#anchor-item-item-1 .paper-add').trigger('click')
    await flushPromises()
    const after = changedDraft(wrapper).sections.find((s) => s.kind === 'experience')!.items[0]!
      .bullets
    expect(after[after.length - 1]!.id).not.toBe(added.id)
  })

  it('shows the header even when the resume has no name yet', () => {
    const draft = makeDraft()
    draft.profile.name = ''
    draft.profile.headline = ''
    draft.profile.contacts = []

    const wrapper = mountEditor({ draft })
    expect(wrapper.find('.paper-header').exists()).toBe(true)
    expect(wrapper.find('.paper-name input').attributes('placeholder')).toBe('姓名')
  })

  it('does not touch the draft it is given', async () => {
    const draft = makeDraft()
    const snapshot = JSON.stringify(draft)
    const wrapper = mountEditor({ draft })
    await buttonByText(wrapper, '＋ 新增一条要点').trigger('click')
    await flushPromises()
    expect(JSON.stringify(draft)).toBe(snapshot)
  })
})
