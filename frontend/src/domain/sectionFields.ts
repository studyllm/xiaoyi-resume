import type { SectionKind } from './types'

/**
 * 每个分区的条目头部字段各叫什么。
 * 教育背景问学校与专业，工作经历问公司与职位，项目经历问项目与角色——
 * 一律叫"公司或机构 / 职位"会让人以为填错了地方。
 */
export interface SectionFieldWords {
  /** 机构类字段 */
  org: string
  /** 职位或专业类字段 */
  title: string
  /** 指代这个条目的说法，如「这段经历」「这个项目」 */
  itemNoun: string
}

export const SECTION_FIELD_WORDS: Record<SectionKind, SectionFieldWords> = {
  education: { org: '学校名称', title: '专业', itemNoun: '这段教育经历' },
  experience: { org: '公司名称', title: '职位', itemNoun: '这段经历' },
  project: { org: '项目名称', title: '角色', itemNoun: '这个项目' },
  skills: { org: '', title: '', itemNoun: '这条技能' },
}
