## Why

当前唯一把简历带走的动作是「复制正文」——复制出来的是纯文本，用户要自己贴进 WPS/Word 手工排版才能投出去。投递链路上这段手工活是这个产品目前最实际的缺口：系统已经把内容按 JD 组织好了，却没给出一份能直接交出去的样子。

PDF 导出目前在 PRD §4 的「不在本版」栏里（"精美 PDF 导出、在线排版编辑器"）。本次要把它挪回本版，因此 PRD 的范围边界必须同步改写，而不是当成一次纯前端优化。

同时发现一个前置缺口：简历的**姓名与联系方式在解析阶段被整体丢弃**——`parseDraft` 只认分区表头，表头之前的行一律跳过。导出的 PDF 因此会是一份没有姓名和联系方式的简历，投不出去。这项能力必须先补上。

## What Changes

**范围回退（PRD §4）**

```
移进「在本版」：预览简历并导出可投用的 A4 PDF
继续留在「不在本版」：精美排版、模板市场、双栏版式、还原原 PDF 栏位与版式
```

最后一条必须继续排除：原型从来只拿到文本，PDF 上传仍是占位，原始版式既拿不到也拿不回。能做的只有**生成一份新的标准排版**。

**新增能力**

- **A4 简历预览**：定向版本可切换到一张 A4 纸的排版视图。排版层级为「单栏 + 经典简历层级」——分区标题加粗带下划线、条目头「公司名 职位 …… 日期」两端对齐、要点悬挂缩进。不做双栏、色块、图标、头像。
- **PDF 导出**：调用浏览器打印，产出**带文字层**的 PDF。刻意的技术选择——把页面截成图片塞进 PDF 虽然能直接下载 `.pdf` 文件，但整页是位图，ATS 招聘系统提取不到任何字段，简历等于不存在。浏览器打印用系统字体排版，文字可选可搜，分页靠 CSS `break-inside` 控制。
- **简历抬头**：姓名、一句话定位、联系方式成为底稿的一部分，解析时从简历正文头部提取，导出时印在 A4 纸顶部。
- **复制为 Markdown**：在现有「复制正文」之外，再提供一份带 Markdown 结构的简历，便于投进接受 Markdown 的表单或贴进支持渲染的编辑器。

**范围边界**

- 只有**定向版本**支持预览与导出。「我的简历」是编辑态的四分区结构，不是一份排好的简历，且没有 JD 定向，导出价值有限。
- 不新增任何运行时依赖。
- 预览与导出共用同一份 DOM 与同一套 CSS，所见即所得成立。
- 抬头只做姓名、一句话定位与联系方式，不加 GitHub、个人网站等字段。
- 导出物不加页码与页眉页脚。
- 三种带走方式（纯文本 / Markdown / PDF）使用同一套日期表示 `2021-03`，内容事实一致。

**PRD 更新（任务 1）**

- §4 范围表：改写排除项措辞，把「导出可投用的 A4 PDF」移入本版
- §5 概念：概念图补上简历抬头
- §7：新增「简历预览与 PDF 导出」小节，写明排版层级、导出方式、抬头来源与不可做项
- §9 验收标准：新增两条（能看到 A4 预览 / 导出 PDF 有文字层且含姓名与联系方式）

**BREAKING**：无。行为变更只有一处——底稿结构新增 `profile` 字段，存储键从 `xiaoyi.draft.v1` 升到 `xiaoyi.draft.v2`；版本结构新增 `profile` 与 `coverage` 字段，存储键从 `xiaoyi.versions.v1` 升到 `xiaoyi.versions.v2`。旧存档经迁移链升级（抬头为空、不阻塞使用）。

## Capabilities

### New Capabilities

- `resume-preview-and-export`: 定向版本的 A4 排版预览、基于浏览器打印的 PDF 导出、以及导出物必须具备文字层与抬头这两条约束

### Modified Capabilities

- `version-management`: 版本详情新增预览与导出入口；版本列表展示导出入口；导出物需含抬头；新增按 Markdown 格式复制简历
- `resume-draft`: 底稿结构新增简历抬头，解析时从正文头部提取，编辑页可修改

## Impact

**文档**

- `docs/v0.1-产品需求文档.md`：§4 范围表、§5 概念、§7 新增小节、§9 验收标准

**代码**

- `frontend/src/domain/types.ts`：`Draft` 新增 `profile`，`VersionItem` 补抬头渲染所需字段
- `frontend/src/engines/parseDraft.ts`：提取简历抬头
- `frontend/src/engines/versionAssembly.ts`：抬头并入版本正文与结构
- 新增 `frontend/src/engines/markdown.ts`：把版本渲染为 Markdown
- `frontend/src/stores/persistence.ts`：新增 `xiaoyi.draft.v2` 键与迁移链
- `frontend/src/stores/draft.ts`、`versions.ts`：抬头的读写与随版本快照
- `frontend/src/views/VersionDetailView.vue`：预览页签与导出按钮
- `frontend/src/views/VersionsView.vue`：列表导出入口
- `frontend/src/views/DraftView.vue`：抬头编辑区
- 新增 `frontend/src/components/ResumePreview.vue`：A4 排版渲染与打印样式

**不受影响**

- 不新增任何 npm 依赖
- 不产生任何网络请求，不引入后端
- 诊断、覆盖分级、排序护栏、删减闸门、措辞变换与不变量校验全部不变
