/**
 * 用户看得见的失败、空态与警告文案都登记在这里，视图不再另写字面文案。
 *
 * 每条状态三段：标题说明现在是什么，说明讲清为什么与接下来能做什么，
 * 主动作是能改变这件事的动作——没有可执行的下一步时就不写。
 */

export interface StateCopy {
  /** 短句，只说明现在的状态。 */
  title: string
  /** 一句话，讲清为什么是这个状态，以及用户现在能做什么。 */
  hint: string
  /** 主动作。空态里渲染成主按钮；没有可执行的下一步时不写。 */
  action?: string
}

/** 当前正在呈现的一条状态。 */
export interface ActiveState {
  state: StateCopy
  vars?: Record<string, string | number>
}

/** 文案里的占位符写成 {name}，取值时替换掉。 */
function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

export function stateTitle(state: StateCopy, vars?: Record<string, string | number>): string {
  return fill(state.title, vars)
}

export function stateHint(state: StateCopy, vars?: Record<string, string | number>): string {
  return fill(state.hint, vars)
}

/** 消息提示里的一句话：状态 + 下一步。 */
export function stateMessage(state: StateCopy, vars?: Record<string, string | number>): string {
  return `${stateTitle(state, vars)}：${stateHint(state, vars)}`
}

/**
 * 登记一张状态表。键保持字面量类型，值统一成 StateCopy，
 * 这样没有主动作的状态也能被安全地当成可选的。
 */
function defineStates<T extends Record<string, StateCopy>>(states: T): { [K in keyof T]: StateCopy } {
  return states
}

/**
 * 失败态：一次操作没成。
 * 每条都要说清用户下一步能做什么，不允许只报「失败」。
 */
export const FAILURE_STATES = defineStates({
  'parse-empty': {
    title: '没有可解析的内容',
    hint: '先把简历正文粘贴进来，至少要有分区标题和条目。',
  },
  'parse-failed': {
    title: '解析失败',
    hint: '没能从这段文字里认出简历结构，换一种带「教育背景」「工作经历」这类分区标题的写法再试一次。',
  },
  'save-failed': {
    title: '保存失败',
    hint: '这次的结果没能存下来，重新解析一次再保存。',
  },
  'nothing-to-save': {
    title: '没有可保存的结果',
    hint: '先解析出简历内容，保存才可用。',
  },
  'jd-empty': {
    title: '还没有 JD 全文',
    hint: '先把岗位描述完整地粘贴进来，系统才能提取出岗位要求。',
  },
  'jd-parse-failed': {
    title: 'JD 解析失败',
    hint: '没能从这段 JD 里认出岗位要求，检查是不是复制完整了，再试一次。',
  },
  'generate-no-draft': {
    title: '需要先导入简历',
    hint: '还没有简历内容，导入一份简历再生成版本。',
  },
  'generate-failed': {
    title: '生成失败',
    hint: '这次没能生成版本，重新生成一次。',
  },
  'copy-failed': {
    title: '复制失败',
    hint: '浏览器没有把正文写进剪贴板，手动选中正文复制。',
  },
  'draft-required': {
    title: '需要先导入简历',
    hint: '还没有简历内容，导入一份简历再继续。',
  },
  'demo-load-failed': {
    title: '演示数据载入失败',
    hint: '刷新页面再试一次。',
  },
  'pdf-not-pdf': {
    title: '这不是 PDF 文件',
    hint: '请上传 PDF，或改用「粘贴文本」。',
  },
  'pdf-too-large': {
    title: '文件太大',
    hint: '这份文件超过 {value} MB，请压缩后再上传。',
  },
  'pdf-too-many-pages': {
    title: '页数太多',
    hint: '这份文件有 {value} 页，超出可解析的上限，请只上传简历部分。',
  },
  'pdf-encrypted': {
    title: 'PDF 有打开口令',
    hint: '请先去掉口令再上传。',
  },
  'pdf-corrupted': {
    title: '文件读不出来',
    hint: '可能是文件损坏或格式不受支持，请换一个文件，或改用「粘贴文本」。',
  },
  'pdf-unreadable': {
    title: '这份 PDF 读不出来',
    hint: '请换一个文件，或改用「粘贴文本」。',
  },
  'pdf-engine-unavailable': {
    title: 'PDF 读取组件加载失败',
    hint: '请刷新页面再试，或改用「粘贴文本」。',
  },
  'pdf-no-text-layer': {
    title: '这份 PDF 没有可读取的文字层',
    hint: '可能是扫描件或图片页，请改用「粘贴文本」，把内容贴进来。',
  },
  'export-missing-profile': {
    title: '抬头缺失',
    hint: '这份简历还没有姓名与联系方式，导出的 PDF 不能直接投递；要导出的话，先回去补全抬头。',
  },
  'storage-unavailable': {
    title: '本地存储不可用',
    hint: '刷新后数据会丢失，这页先别继续操作。',
  },
  // 下面两条是 P3 服务端化才会触发的，先把文案定下来，到时候不必再改一遍
  'network-failed': {
    title: '网络请求失败',
    hint: '检查网络连接后重试。',
  },
  'not-logged-in': {
    title: '还没有登录',
    hint: '先登录，然后才能保存与同步。',
  },
  'confirm-overwrite': {
    title: '需要先确认覆盖',
    hint: '覆盖当前简历要先确认一次，已经生成的版本不会跟着改变。',
  },
})

export type FailureState = keyof typeof FAILURE_STATES

/**
 * 空态：现在还没有可展示的东西。
 * 有用户能立刻执行的下一步才写动作；没有的话，说明里要讲清为什么。
 */
export const EMPTY_STATES = defineStates({
  'no-draft': {
    title: '还没有简历',
    hint: '导入一份简历后，就能编辑、诊断，并按岗位生成版本。',
    action: '去导入简历',
  },
  'no-versions': {
    title: '还没有生成任何版本',
    hint: '粘贴一份岗位描述，系统会按它生成一份可投递的简历。',
    action: '去粘贴 JD',
  },
  'no-diagnosis': {
    title: '还没有诊断结果',
    hint: '诊断会指出这份简历缺什么、哪里不顺，并给出改写建议。',
    action: '开始诊断',
  },
  'no-diagnosis-issues': {
    title: '没有查出问题',
    hint: '这份简历暂时没有查出需要修改的地方，改过之后可以再诊断一次。',
    action: '重新诊断',
  },
  'comments-filtered': {
    title: '当前条件下没有批注',
    hint: '批注还在，只是被筛选条件挡住了。',
    action: '清除筛选',
  },
  'comments-ignored': {
    title: '批注都被标成了忽略',
    hint: '这些批注都标了忽略所以没显示。清空诊断结果后重新诊断一次，就能再看到它们。',
  },
  'jd-no-requirements': {
    title: '没有提取到明确的要求条目',
    hint: '这段 JD 里没有能被认成岗位要求的句子。改一下写法，或者直接生成版本。',
    action: '编辑 JD',
  },
  'version-not-found': {
    title: '没有找到这个版本',
    hint: '这个版本可能已经被删除了。',
    action: '回到版本列表',
  },
  'no-diff': {
    title: '没有可对照的改动',
    hint: '版本正文和当前简历完全一致，所以没有差异可对照。',
  },
  'all-covered': {
    title: '要求都能找到对应事实',
    hint: '这份 JD 的要求在你的简历中都有对应事实，不需要额外补充。',
  },
})

export type EmptyState = keyof typeof EMPTY_STATES

/**
 * 警告态：没出错，但用户最好看一眼。
 * 数量之类的可变内容写成 {value} 占位符。
 */
export const WARNING_STATES = defineStates({
  'pdf-sparse': {
    title: '这份 PDF 能读到的文字很少',
    hint: '可能是扫描件或图片页。下面是读到的部分，请核对后再保存。',
  },
  'unrecognized-sections': {
    title: '这份简历有 {value} 段我们不确定属于哪个分区，放在「其它」里了',
    hint: '下面这几段没能归到教育、经历、项目、技能任何一个分区，可以在纸上直接改。',
  },
  'low-confidence': {
    title: '结构识别不完整，请确认后再保存',
    hint: '这次解析没能认出全部分区标题，下面是按启发式推断的，可以在保存前直接在纸上改。',
  },
  'structure-issues': {
    title: '这份简历有 {value} 处结构问题',
    hint: '这些地方缺内容或时间对不上，可以在纸上直接改。',
  },
})

export type WarningState = keyof typeof WARNING_STATES
