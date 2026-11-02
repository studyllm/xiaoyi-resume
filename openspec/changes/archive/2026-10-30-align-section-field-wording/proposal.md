## Why

编辑模式下新增一段教育经历，字段问的是"公司或机构"和"职位"。填教育经历的人看到这两个词会先愣一下——这里要填的是学校和专业。

问题出在字段名写死在一处：

```
item-org    的占位： 公司或机构
item-title  的占位： 职位
```

所有分区共用这两个词。数据结构其实是对的——每个分区都是"机构类字段 + 职位类字段"两个槽位，只是不同分区该叫不同的名字：

```
教育背景   学校名称   专业
工作经历   公司名称   职位
项目经历   项目名称   角色
```

同样的错也在诊断意见里。给一条没有填学校的教育经历，批注写的是"这段经历没有公司或机构名称"——和界面上刚让人填"学校名称"直接打架。

## What Changes

**一份分区词汇表，界面与诊断共用**

```
SECTION_FIELD_WORDS = {
  education:  { org: '学校名称', title: '专业', itemNoun: '这段教育经历' },
  experience: { org: '公司名称', title: '职位', itemNoun: '这段经历' },
  project:    { org: '项目名称', title: '角色', itemNoun: '这个项目' },
  skills:     { org: '', title: '', itemNoun: '这条技能' },
}
```

放在 `frontend/src/domain/sectionFields.ts`，因为编辑页、诊断引擎与结构提醒三处都要用同一份说法，不该各写一份。

**三处跟着分区换词**

```
编辑页的输入框占位   fieldLabel(section.kind, 'org' / 'title')
编辑页的结构提醒     「…缺少学校名称」
诊断引擎的意见       missingOrgWords(kind) / missingTitleWords(kind)
```

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-draft`: 新增「分区字段的措辞跟随分区」，规定各分区条目头字段的名称与新增入口的措辞
- `draft-diagnosis`: 缺少机构或职位类字段的意见按分区措辞

## Impact

**代码**

- `frontend/src/domain/sectionFields.ts`：新增分区词汇表
- `frontend/src/views/DraftView.vue`：字段占位与结构提醒改用词汇表
- `frontend/src/engines/diagnose.ts`：缺字段的意见按分区生成文案

**不受影响**

- 不改领域模型：分区仍然只有"机构类字段 + 职位类字段"两个槽位，只是叫法不同
- 不改规则本身：哪些情况算"缺字段"没有变化
- 不新增依赖
