## Why

「自我评价」「获奖经历」「证书」「语言能力」这类分区**在产品里没有位置归属**——它们不对应教育、经历、项目、技能任何一个。当前解析器认不出这些表头（它们被当成普通内容），于是那一段被并进上一个分区，用户看到的是「工作经历里混进了一段获奖经历」。

识别率改进（`improve-resume-recognition`）已经补齐了四个主分区的写法，但这类表头**永远不会被识别成表头**——因为产品里就没有对应的分区。加一个兜底提示能让用户知道，但改不了根。

根因是缺一个「其它」分区。

## What Changes

- 领域模型新增第五个分区 `'other'`，界面标题「其它」
- **「其它」的内容形态与「专业技能」同构**：没有条目头，只有一行行要点。「自我评价」是一段话、「获奖经历」是「2021 年度技术突破奖」这样的一行、「证书」是「英语六级 CET-6」这样的一行——它们本来就该是一行行标签，不该有公司名与起止年月
- 解析器认出一批「其它类」表头（自我评价、获奖经历、荣誉奖项、证书、语言能力、社团经历、志愿服务……），命中它们的段落进「其它」分区
- 空「其它」分区不报「分区为空」、不产生解析警告、不影响置信度
- 导入页的提示改成报告事实：「这份简历有 N 段我们不确定属于哪个分区，放在『其它』里了」，并列出是哪几段
- 删掉基于长度的「疑似表头」启发式——实测它对 4 字普通要点（沟通良好、责任心强、抗压能力……）**12/12 全部误判**，既不能用于路由也不适合用于告警

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-draft`: 增补要求——「其它」分区的存在、内容形态与新增落点；分区表头按常见写法被识别（补上其它类表头）。
- `draft-diagnosis`: 缺字段意见按所在分区的说法表述——补上「其它」没有字段这件事。
- `resume-preview-and-export`: 导出物包含全部内容分区，「其它」也一并导出。

## Impact

- **领域模型**：`domain/types.ts`（`SectionKind`、`SECTION_ORDER`、`SECTION_TITLES`）、`domain/sectionFields.ts`（字段措辞）
- **解析**：`engines/parseDraft.ts`（表头关键词、警告、置信度）、`engines/types.ts`（`ParseResult`）
- **诊断**：`engines/structure.ts`（「其它」与「专业技能」同样没有条目头，不查字段与时间）
- **版本生成**：`engines/generateVersion.ts`（只为底稿里存在的分区生成）
- **存档**：`stores/persistence.ts`（分区种类表；旧存档不受影响）
- **界面**：`components/ResumeEditor.vue`、`components/ResumePreview.vue`、`views/ImportView.vue`、`views/WelcomeView.vue`（落地页「四个分区」文案）
- **测试**：`parseDraft.spec.ts`、`stores/draft.spec.ts` 等断言分区数量与顺序的地方
- **规格**：`resume-draft`、`draft-diagnosis`、`resume-preview-and-export`

## 不做

- 不给「其它」分区加条目头（公司名、职位、起止年月）。理由见 design.md 决策 1
- 不做「其它」分区的自动归类——用户自己决定内容放不放得对
- 不改四个主分区的任何行为
