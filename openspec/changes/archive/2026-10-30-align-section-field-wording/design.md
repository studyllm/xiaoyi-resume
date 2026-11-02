## Context

条目在数据上只有两个头字段：`org`（机构类）与 `title`（职位类）。教育背景的 `org` 装的是学校、`title` 装的是专业；工作经历才是公司与职位。

界面上一律叫"公司或机构 / 职位"，于是教育经历一填就填错地方——用户是照着占位提示填的，占位提示本身在骗人。

同一份词表要在三处用：编辑页的输入框占位、编辑页的结构提醒、诊断引擎的缺字段意见。三处各写一份的话，改一处漏一处，最后又是"界面说学校、批注说公司"。

## Goals / Non-Goals

**Goals:**

- 各分区条目头的字段名与该分区实际要填的内容一致
- 界面与诊断意见用同一份说法
- 词汇只有一处定义

**Non-Goals:**

- 不改领域模型：仍然只有 `org` 与 `title` 两个槽位
- 不改诊断规则本身：哪些情况算缺字段不变
- 不改简历导出的内容

## Decisions

### D1 词汇表放 domain 层

`frontend/src/domain/sectionFields.ts`：

```ts
export const SECTION_FIELD_WORDS: Record<SectionKind, SectionFieldWords> = {
  education:  { org: '学校名称', title: '专业', itemNoun: '这段教育经历' },
  experience: { org: '公司名称', title: '职位', itemNoun: '这段经历' },
  project:    { org: '项目名称', title: '角色', itemNoun: '这个项目' },
  skills:     { org: '', title: '', itemNoun: '这条技能' },
}
```

放在 domain 而不是视图里，是因为诊断引擎（`engines/`）也要用——引擎不依赖视图，视图依赖 domain。`itemNoun` 一起放在这里，是为了让"这段经历没有公司名称"这句话的整句都在同一处定义。

专业技能没有这两个字段，所以留空；界面上这个分区本来就不渲染条目头，诊断引擎也不对它跑这两条规则。

### D2 诊断意见按分区生成，不做字符串替换

```ts
function missingOrgWords(kind: SectionKind) {
  const words = SECTION_FIELD_WORDS[kind]
  return {
    problem: `${words.itemNoun}没有${words.org}。`,
    suggestion: `补上${words.org}。句式建议：「〈${words.org}〉 〈${words.title}〉 〈起止年月〉」。`,
  }
}
```

不用"先写一句通用文案再把公司换成学校"的做法——那要求通用句式恰好能替换，句式一改就漏。

规则本身没变：仍然是有 `org` 没 `org` 报 `missing-org`，没有 `title`（项目除外）报 `missing-title`。变的只是这两条意见说什么。

### D3 措辞面向用户，不面向数据

界面上不出现"机构""职位名称"这类数据结构的词。用户看到的每个占位都是他该填的东西：学校名称、专业、公司名称、职位、项目名称、角色。

## Risks / Trade-offs

**[项目分区的"角色"是新词]** → 项目的 `title` 在示例数据里是空的，填不填由用户定；叫"角色"比叫"职位"更贴近项目语境。

**[词汇表与分区定义分了两处]** → 分区列表在 `domain/types.ts`，词汇在 `domain/sectionFields.ts`，两处都要记得加。`Record<SectionKind, ...>` 会在类型层面卡住漏加——新增分区时类型检查会报错。

**[旧文案可能被别处引用]** → 诊断意见的文案只在诊断引擎里生成，引擎测试只断言规则编号，不断言文案；改文案不会牵动别处。

## Migration Plan

1. 新增 `domain/sectionFields.ts`
2. 诊断引擎的 `missing-org` / `missing-title` 改用分区词汇
3. 编辑页的字段占位与结构提醒改用分区词汇
4. 验证：教育背景新增后是"学校名称 / 专业"；工作经历是"公司名称 / 职位"；项目经历是"项目名称 / 角色"；教育经历缺字段时批注问的是学校与专业

**回滚**：纯前端改动，无数据迁移。

## Open Questions

本设计无遗留开放问题。
