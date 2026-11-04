import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { FORBIDDEN_WORDS, findForbiddenWords } from '@/engines/forbidden'
import {
  EMPTY_STATES,
  FAILURE_STATES,
  WARNING_STATES,
  stateHint,
  stateMessage,
  stateTitle,
} from '@/domain/states'
import { renderMarkdown } from '@/engines/markdown'
import { SAMPLE_DRAFT_TEXT, SAMPLE_JD_BACKEND, SAMPLE_JD_FRONTEND } from '@/mock/fixtures'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useVersionStore } from '@/stores/versions'

const INTERNAL_TERM = '底稿'

function viewsDirectory(): string {
  return new URL('./views/', import.meta.url).pathname
}

function componentsDirectory(): string {
  return new URL('./components/', import.meta.url).pathname
}

function layoutsDirectory(): string {
  return new URL('./layouts/', import.meta.url).pathname
}

function storesDirectory(): string {
  return new URL('./stores/', import.meta.url).pathname
}

interface TemplateEntry {
  name: string
  template: string
}

function viewTemplateEntries(): TemplateEntry[] {
  const directories = [viewsDirectory(), componentsDirectory(), layoutsDirectory()]
  const entries: TemplateEntry[] = []
  for (const directory of directories) {
    const files = readdirSync(directory).filter((name) => name.endsWith('.vue'))
    for (const name of files) {
      const content = readFileSync(join(directory, name), 'utf8')
      const match = /<template>([\s\S]*)<\/template>/.exec(content)
      entries.push({ name, template: match?.[1] ?? '' })
    }
  }
  return entries
}

function viewTemplates(): string[] {
  return viewTemplateEntries().map((entry) => `${entry.name}\n${entry.template}`)
}

/** 除设计变量文件外的全部样式文件。 */
function styleFiles(): string[] {
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.name.endsWith('.vue') && !entry.name.endsWith('.css')) continue
      if (entry.name === 'tokens.css') continue
      files.push(path)
    }
  }
  walk(join(process.cwd(), 'src'))
  return files
}

function numbersOf(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0])
}

interface ButtonUsage {
  attrs: string
  text: string
  index: number
}

/** 模板里的每一个操作按钮，连同它的属性与文案。 */
function buttonsIn(template: string): ButtonUsage[] {
  const usages: ButtonUsage[] = []
  for (const match of template.matchAll(/<el-button\b([^>]*?)(?:\/>|>([\s\S]*?)<\/el-button>)/g)) {
    const attrs = match[1]!.split(/\s+/).filter(Boolean).join(' ')
    usages.push({
      attrs,
      text: (match[2] ?? '')
        .replace(/<[^>]+>/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .join(' '),
      index: match.index!,
    })
  }
  return usages
}

function hasAttr(attrs: string, name: string): boolean {
  return attrs.split(/\s+/).includes(name)
}

/** 实心主色按钮：primary 且不是文字按钮。 */
function isSolidPrimary(attrs: string): boolean {
  return hasAttr(attrs, 'type="primary"') && !hasAttr(attrs, 'text')
}

/** 带边框的次要动作：既不是文字按钮，也不是主色。 */
function isBorderedSecondary(attrs: string): boolean {
  return !hasAttr(attrs, 'type="primary"') && !hasAttr(attrs, 'text')
}

/** class 命中某个名字的 div 的成对区间。 */
function divRanges(template: string, className: string): [number, number][] {
  const ranges: [number, number][] = []
  const open = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'g')
  let match: RegExpExecArray | null
  while ((match = open.exec(template)) !== null) {
    let depth = 1
    const tags = /<div\b|<\/div>/g
    tags.lastIndex = match.index + match[0].length
    let tag: RegExpExecArray | null
    let end = template.length
    while ((tag = tags.exec(template)) !== null) {
      depth += tag[0].startsWith('</') ? -1 : 1
      if (depth === 0) {
        end = tag.index
        break
      }
    }
    ranges.push([match.index, end])
  }
  return ranges
}

interface SourceEntry {
  name: string
  source: string
}

/** 视图、组件与布局的整份文件，不只模板。 */
function viewSourceEntries(): SourceEntry[] {
  const directories = [viewsDirectory(), componentsDirectory(), layoutsDirectory()]
  const entries: SourceEntry[] = []
  for (const directory of directories) {
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.vue'))) {
      entries.push({ name, source: readFileSync(join(directory, name), 'utf8') })
    }
  }
  return entries
}

/**
 * 去掉注释，免得把说明文字当成界面文案。
 * 行注释只认整行都是注释的那种，免得把网址里的 // 一起吃掉。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** el-empty 元素的成对区间：空状态里的按钮不与页面动作同屏。 */
function emptyRanges(template: string): [number, number][] {
  const ranges: [number, number][] = []
  const open = /<el-empty\b[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = open.exec(template)) !== null) {
    const end = template.indexOf('</el-empty>', match.index)
    ranges.push([match.index, end === -1 ? template.length : end])
  }
  return ranges
}

function inside(index: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end)
}

/** 页面动作区：页头那排操作，以及表单里的那排操作。 */
const ACTION_AREA_CLASSES = ['page-actions', 'import-actions']

function actionAreaRanges(template: string): [number, number][] {
  return ACTION_AREA_CLASSES.flatMap((className) => divRanges(template, className))
}

/** 允许出现带边框次要动作的位置：对话框、顶栏、落地页。 */
const BORDERED_EXCEPTIONS = new Set([
  'UnsavedChangesDialog.vue',
  'DefaultLayout.vue',
  'WelcomeView.vue',
])

/** 允许出现第二个实心主色的位置：导入页的解析与保存分属流程两步。 */
const PRIMARY_EXCEPTIONS = new Set(['ImportView.vue'])

/**
 * 独立交互层：覆盖在页面之上的对话框。层内允许一个实心主色，
 * 不与它遮住的页面合计——否则身份对话框和落地页的主按钮会被算成同屏两个。
 */
const OVERLAY_LAYERS = new Set(['IdentityDialog.vue'])

/** 动作区里允许的实心主色个数上限。导入页的解析与保存分属流程的两步，是规格写明的例外。 */
const ACTION_PRIMARY_LIMITS: Record<string, number> = { 'ImportView.vue': 2 }

function seedDraft(): void {
  const session = useSessionStore()
  session.login('张三')
  const draftStore = useDraftStore()
  draftStore.ingest(SAMPLE_DRAFT_TEXT)
  draftStore.savePending()
}

describe('完整流程回归', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('走通登录 → 放入 → 诊断 → 生成 → 列表 → 详情', () => {
    const session = useSessionStore()
    expect(session.isLoggedIn).toBe(false)
    session.login('张三')
    expect(session.isLoggedIn).toBe(true)

    const draftStore = useDraftStore()
    const parsed = draftStore.ingest(SAMPLE_DRAFT_TEXT)
    expect(parsed.ok).toBe(true)
    expect(draftStore.savePending().ok).toBe(true)

    const diagnosis = draftStore.diagnose()
    expect(diagnosis.issues.length).toBeGreaterThan(0)

    const versionStore = useVersionStore()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)
    expect(versionStore.versions).toHaveLength(1)
    expect(versionStore.byId(version.id)).toBeDefined()
    expect(version.body).toContain('工作经历')
  })

  it('改底稿之后旧版本的正文与改动对照都不变', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)
    const bodyBefore = version.body
    const diffBefore = JSON.stringify(version.diff)

    const section = draftStore.draft!.sections.find((item) => item.kind === 'experience')!
    draftStore.updateBulletText(
      section.id,
      section.items[0]!.id,
      section.items[0]!.bullets[0]!.id,
      '改写之后的要点',
    )

    const stored = versionStore.byId(version.id)!
    expect(stored.body).toBe(bodyBefore)
    expect(JSON.stringify(stored.diff)).toBe(diffBefore)
    expect(stored.draftRevision).toBe(version.draftRevision)
  })

  it('同一份 JD 生成两次得到两份并存快照', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()

    const first = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)
    const second = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    expect(versionStore.versions).toHaveLength(2)
    expect(first.id).not.toBe(second.id)
    expect(first.body).toBe(second.body)
  })

  it('删除其中一个版本不影响底稿与另一个版本', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()

    const first = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)
    const second = versionStore.generate(draftStore.draft!, SAMPLE_JD_BACKEND)
    const draftBefore = JSON.stringify(draftStore.draft)

    versionStore.remove(first.id)

    expect(versionStore.versions).toHaveLength(1)
    expect(versionStore.byId(second.id)).toBeDefined()
    expect(JSON.stringify(draftStore.draft)).toBe(draftBefore)
  })

  it('重新登录之后底稿与版本都能恢复', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()
    versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    const session = useSessionStore()
    session.logout()
    expect(session.isLoggedIn).toBe(false)

    session.login('张三')
    setActivePinia(createPinia())
    useSessionStore().restore()
    useDraftStore().restore()
    useVersionStore().restore()

    expect(useDraftStore().hasDraft).toBe(true)
    expect(useVersionStore().versions).toHaveLength(1)
  })

  it('引擎输出里没有任何题目类文本', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()

    const diagnosis = draftStore.diagnose()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    for (const issue of diagnosis.issues) {
      expect(findForbiddenWords(`${issue.problem}${issue.suggestion}${issue.quote}`)).toEqual([])
    }
    expect(findForbiddenWords(version.body)).toEqual([])
    for (const entry of version.uncovered) {
      expect(findForbiddenWords(entry.explanation)).toEqual([])
    }
  })

  it('界面文案里不出现内部术语「底稿」', () => {
    const templates = viewTemplates()
    expect(templates.length).toBeGreaterThan(0)
    for (const template of templates) {
      expect(template).not.toContain(INTERNAL_TERM)
    }
  })

  it('引擎产出的文案里不出现内部术语「底稿」', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    for (const entry of version.uncovered) {
      expect(entry.explanation).not.toContain(INTERNAL_TERM)
    }
    for (const entry of version.diff) {
      expect(entry.reason).not.toContain(INTERNAL_TERM)
    }
  })

  it('导出的三种格式里的数字都来自底稿', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    const draftNumbers = new Set(numbersOf(JSON.stringify(draftStore.draft)))
    for (const text of [version.body, renderMarkdown(version)]) {
      for (const number of numbersOf(text)) {
        expect(draftNumbers.has(number)).toBe(true)
      }
    }
  })

  it('界面样式里的视觉字面量只允许出现在设计变量文件里', () => {
    const offenders: string[] = []
    for (const file of styleFiles()) {
      const content = readFileSync(file, 'utf8')
      content.split('\n').forEach((line, index) => {
        const match = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/.exec(line)
        if (match) offenders.push(`${file}:${index + 1} ${match[0]}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('不直接从 element-plus 根包引组件', () => {
    // 从根包引会绕过自动导入带来的样式：命令式弹窗只剩两个按钮，还跑到左上角
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(path)
          continue
        }
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.vue')) continue
        if (entry.name.endsWith('.spec.ts')) continue
        if (/from ['"]element-plus['"]/.test(readFileSync(path, 'utf8'))) {
          offenders.push(path)
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })

  it('界面模板里没有任何题目类文本', () => {
    for (const template of viewTemplates()) {
      expect(findForbiddenWords(template)).toEqual([])
    }
  })

  it('上传入口是真实实现，不是占位', () => {
    const template = readFileSync(join(process.cwd(), 'src/views/ImportView.vue'), 'utf-8')
    expect(template).not.toContain('暂不支持 PDF 解析')
    expect(template).not.toContain('仅作占位展示')
    expect(template).not.toContain('不产生任何简历内容')
    // 真的去读文件，而不是只渲染一个拖拽框
    expect(template).toContain('extractPdfText')
  })

  it('生成的版本没有出现底稿之外的数字', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    const draftNumbers = new Set(numbersOf(JSON.stringify(draftStore.draft)))
    for (const number of numbersOf(version.body)) {
      expect(draftNumbers.has(number)).toBe(true)
    }
  })

  it('生成的版本没有出现底稿之外的实体', () => {
    seedDraft()
    const draftStore = useDraftStore()
    const versionStore = useVersionStore()
    const version = versionStore.generate(draftStore.draft!, SAMPLE_JD_FRONTEND)

    const draftText = JSON.stringify(draftStore.draft)
    for (const word of ['Kafka', 'Kubernetes', 'Rust', 'Elasticsearch', 'Golang']) {
      expect(version.body).not.toContain(word)
      expect(draftText).not.toContain(word)
    }
  })

  it('禁用词表覆盖了界面承诺的边界', () => {
    for (const word of ['题目', '题库', '刷题', '考点', '真题', '面经', '笔试', '八股']) {
      expect(FORBIDDEN_WORDS).toContain(word)
    }
  })
})

describe('操作按钮的形态', () => {
  it('页面动作区里的按钮都是 small 尺寸', () => {
    const offenders: string[] = []
    for (const { name, template } of viewTemplateEntries()) {
      const ranges = actionAreaRanges(template)
      for (const usage of buttonsIn(template)) {
        if (!inside(usage.index, ranges)) continue
        if (!hasAttr(usage.attrs, 'size="small"')) offenders.push(`${name} ${usage.text}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('页面动作区里只有一个实心主色，其余是文字按钮', () => {
    const offenders: string[] = []
    for (const { name, template } of viewTemplateEntries()) {
      const ranges = actionAreaRanges(template)
      const inAction = buttonsIn(template).filter((usage) => inside(usage.index, ranges))
      const solid = inAction.filter((usage) => isSolidPrimary(usage.attrs))
      const limit = ACTION_PRIMARY_LIMITS[name] ?? 1
      if (solid.length > limit) {
        offenders.push(`${name} 的动作区里有 ${solid.length} 个实心主色`)
      }
      for (const usage of inAction) {
        if (isSolidPrimary(usage.attrs)) continue
        if (!hasAttr(usage.attrs, 'text')) offenders.push(`${name} ${usage.text} 是带边框的次要动作`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('带边框的次要动作只出现在对话框、顶栏与落地页', () => {
    const offenders: string[] = []
    for (const { name, template } of viewTemplateEntries()) {
      if (BORDERED_EXCEPTIONS.has(name)) continue
      for (const usage of buttonsIn(template)) {
        if (isBorderedSecondary(usage.attrs)) offenders.push(`${name} ${usage.text}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('一个界面上至多一个实心主色按钮', () => {
    const offenders: string[] = []
    for (const { name, template } of viewTemplateEntries()) {
      if (PRIMARY_EXCEPTIONS.has(name)) continue
      const empties = emptyRanges(template)
      const solid = buttonsIn(template).filter(
        (usage) => isSolidPrimary(usage.attrs) && !inside(usage.index, empties),
      )
      if (solid.length > 1) {
        offenders.push(`${name} 有 ${solid.length} 个实心主色：${solid.map((u) => u.text).join('、')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('卡片里的操作按钮都带图标', () => {
    const offenders: string[] = []
    for (const { name, template } of viewTemplateEntries()) {
      for (const usage of buttonsIn(template)) {
        if (name === 'DiagnosisComment.vue') {
          if (!usage.attrs.includes(':icon=')) offenders.push(`${name} ${usage.text}`)
          continue
        }
        if (name !== 'VersionsView.vue') continue
        const isCardAction =
          ['打开', '复制纯文本', '导出 PDF'].includes(usage.text) ||
          usage.attrs.includes('aria-label="删除这个版本"')
        if (isCardAction && !usage.attrs.includes(':icon=')) {
          offenders.push(`${name} ${usage.text || '删除'}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('登录表单不内联在落地页里', () => {
    // 登录表单的实心主色属于独立交互层。一旦把它内联回落地页，
    // 落地页上就会出现两个同屏的实心主色，守卫按文件统计抓不到。
    const landing = viewTemplateEntries().find((entry) => entry.name === 'WelcomeView.vue')
    const template = landing?.template ?? ''
    expect(template).not.toMatch(/<el-form\b/)
    expect(template).not.toMatch(/<el-input\b/)
  })
  it('身份对话框里没有密码输入项', () => {
    // 问了一个不校验的密码，就是承诺了做不到的事；身份只要一个名字
    const dialog = viewTemplateEntries().find((entry) => entry.name === 'IdentityDialog.vue')
    const template = dialog?.template ?? ''
    expect(template).not.toMatch(/密码/)
    expect(template).not.toMatch(/type="password"/)
  })

  it('简历与版本按用户分槽存放', () => {
    // 存在一处固定 key 的话，换个名字登录看到的还是上一个人那份
    const draftStore = readFileSync(join(storesDirectory(), 'draft.ts'), 'utf8')
    const versionStore = readFileSync(join(storesDirectory(), 'versions.ts'), 'utf8')
    expect(draftStore).toContain('draftKey(')
    expect(versionStore).toContain('versionsKey(')
    expect(draftStore).not.toMatch(/persistence\.write\(STORAGE_KEYS\./)
    expect(versionStore).not.toMatch(/persistence\.write\(STORAGE_KEYS\./)
  })

  it('落地页两个入口动作的文案', () => {
    const landing = viewTemplateEntries().find((entry) => entry.name === 'WelcomeView.vue')
    const template = landing?.template ?? ''
    // 主动作随状态换词，两态都要在
    expect(template).toContain('导入我的简历')
    expect(template).toContain('打开我的简历')
    // 旁路不用「数据」指代简历
    expect(template).not.toContain('样例数据')
    expect(template).toContain('用示例简历试一遍')
  })
})

describe('品牌标识', () => {
  it('两处顶栏都有标识', () => {
    for (const name of ['WelcomeView.vue', 'DefaultLayout.vue']) {
      const entry = viewTemplateEntries().find((item) => item.name === name)
      expect(entry?.template ?? '').toContain('<BrandLogo')
    }
  })

  it('标识只从固定路径引用', () => {
    // 资源路径写在脚本里，得读整个文件而不是只读模板
    const content = readFileSync(join(componentsDirectory(), 'BrandLogo.vue'), 'utf8')
    expect(content).toContain('@/assets/logo.png')

    // 标识统一由 BrandLogo 渲染，别处不自己贴 <img>
    const others = viewTemplateEntries().filter(
      (entry) => entry.name !== 'BrandLogo.vue' && /<img\b/.test(entry.template),
    )
    expect(others.map((entry) => entry.name)).toEqual([])
  })

  it('标识是装饰性的，不带替代文本', () => {
    const logo = viewTemplateEntries().find((entry) => entry.name === 'BrandLogo.vue')
    const template = logo?.template ?? ''
    expect(template).toMatch(/<img[^>]*alt=""/)
    expect(template).not.toMatch(/alt="[^"]+"/)
  })
})

describe('落地页的形态', () => {
  it('全仓的字号、圆角与间距都走设计变量', () => {
    // 纸面是打印稿，用 pt/mm 表达物理尺寸，界面刻度对它不适用——所以只禁 px。
    // 几何尺寸（width / height / top / border-width）不受这条约束。
    const offenders: string[] = []
    for (const file of styleFiles()) {
      const content = readFileSync(file, 'utf8')
      const blocks = file.endsWith('.vue')
        ? [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1] ?? '')
        : [content]
      blocks.forEach((block) => {
        for (const match of block.matchAll(
          /(?:font-size|border-radius|padding|margin|gap|row-gap|column-gap)[a-z-]*\s*:\s*([^;]+);/g,
        )) {
          if (/\d+px/.test(match[0])) {
            offenders.push(`${file.replace(`${process.cwd()}/`, '')} ${match[0].trim()}`)
          }
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('落地页的顶栏与主内容共用同一个容器', () => {
    const landing = viewTemplateEntries().find((entry) => entry.name === 'WelcomeView.vue')
    const template = landing?.template ?? ''
    const containers = [...template.matchAll(/class="[^"]*\blanding-container\b[^"]*"/g)]
    // 顶栏、首屏、页脚各一个容器
    expect(containers.length).toBe(3)
  })

  it('落地页这一屏的实心主色分层计算', () => {
    const solidOf = (template: string) =>
      buttonsIn(template).filter((usage) => isSolidPrimary(usage.attrs))

    const landing = viewTemplateEntries().find((entry) => entry.name === 'WelcomeView.vue')
    expect(solidOf(landing?.template ?? '')).toHaveLength(1)

    // 登录对话框是覆盖在落地页之上的独立层：层内允许一个实心主色，
    // 不与落地页那个合计——否则同一屏上会出现两个实心主色。
    const overlays = viewTemplateEntries().filter((entry) => OVERLAY_LAYERS.has(entry.name))
    expect(overlays.map((entry) => entry.name)).toContain('IdentityDialog.vue')
    for (const overlay of overlays) {
      expect(solidOf(overlay.template).length).toBeLessThanOrEqual(1)
    }
  })
})

describe('状态与文案体系', () => {
  const ALL_STATES = { ...FAILURE_STATES, ...EMPTY_STATES, ...WARNING_STATES }

  it('状态表里每条文案都非空，也不出现内部术语与禁用词', () => {
    const problems: string[] = []
    for (const [key, state] of Object.entries(ALL_STATES)) {
      if (!state.title.trim()) problems.push(`${key} 缺标题`)
      if (!state.hint.trim()) problems.push(`${key} 缺说明`)
      if (state.action !== undefined && !state.action.trim()) problems.push(`${key} 的主动作是空的`)
      for (const text of [state.title, state.hint, state.action ?? '']) {
        if (text.includes(INTERNAL_TERM)) problems.push(`${key} 出现了「底稿」`)
        if (findForbiddenWords(text).length > 0) problems.push(`${key} 出现了禁用词`)
      }
    }
    expect(problems).toEqual([])
  })

  it('每条失败提示都给出了下一步', () => {
    // 「失败」后面必须跟着用户能做的动作，否则用户只知道自己没成，不知道怎么办。
    const cues = ['请', '改', '再', '换', '检查', '刷新', '重新', '手动', '先']
    const problems: string[] = []
    for (const [key, state] of Object.entries(FAILURE_STATES)) {
      if (!cues.some((cue) => state.hint.includes(cue))) {
        problems.push(`${key} 的说明里没有下一步`)
      }
    }
    expect(problems).toEqual([])
  })

  it('占位符只用 {value} 一个名字', () => {
    // 调用方只可能知道一个可变的量：出问题的那一个。多一个名字就多一处要对上的地方。
    const names = new Set<string>()
    for (const state of Object.values(ALL_STATES)) {
      for (const text of [state.title, state.hint]) {
        for (const match of text.matchAll(/\{(\w+)\}/g)) names.add(match[1])
      }
    }
    expect([...names].sort()).toEqual(['value'])
  })

  it('占位符填得上', () => {
    expect(stateTitle(FAILURE_STATES['pdf-too-large'], { value: 10 })).toBe('文件太大')
    expect(stateHint(FAILURE_STATES['pdf-too-large'], { value: 10 })).toContain('10 MB')
    expect(stateMessage(FAILURE_STATES['pdf-too-large'], { value: 10 })).toContain('10 MB')
    expect(stateTitle(WARNING_STATES['structure-issues'], { value: 3 })).toContain('3 处')
  })

  it('失败与空态的文案只从状态表里取', () => {
    const markers = ['失败', '还没有', '没有找到', '请先', '需要先', '没能', '读不出来', '不可用']
    const offenders: string[] = []
    for (const { name, source } of viewSourceEntries()) {
      const code = stripComments(source)
      for (const marker of markers) {
        if (code.includes(marker)) offenders.push(`${name} 里出现了「${marker}」`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('无障碍与响应式基线', () => {
  it('只有图标的按钮都带可访问名称', () => {
    // 断言属性存在是结构检查，不是样式效果——允许。
    const offenders: string[] = []
    for (const { name, template } of viewTemplateEntries()) {
      for (const usage of buttonsIn(template)) {
        const hasIcon = usage.attrs.includes(':icon=') || usage.attrs.includes(' icon=')
        if (!hasIcon) continue
        if (usage.text) continue
        if (!usage.attrs.includes('aria-label=')) {
          offenders.push(`${name} ${usage.attrs.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('打印时纸面不被缩放', () => {
    // 缩放只发生在屏幕这一侧；打印稿必须是 A4 原尺寸。
    const canvas = readFileSync(join(componentsDirectory(), 'PaperCanvas.vue'), 'utf8')
    expect(canvas).toMatch(/@media print[\s\S]*?zoom:\s*1/)
  })
})
