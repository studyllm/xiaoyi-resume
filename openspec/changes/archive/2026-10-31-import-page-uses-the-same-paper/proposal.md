## Why

导入页的「解析结果预览」是自画的一套弱渲染（`frontend/src/views/ImportView.vue`）：每个分区一个标题，每个条目一行灰底，每条要点一个 textarea。

它能改的只有要点正文。公司、职位、时间、抬头都改不了，条目也不能增删。而同一个产品里已经有一张能改全部内容的纸了——上一轮抽出来的受控组件 `components/ResumeEditor.vue`（props `draft` / `issues` / `editable`，emits `change` / `select-comment` / `save-request`）。

产品负责人要求把解析结果预览同步改成同一张纸。

## What Changes

解析结果区从「卡片里的一串列表」变成一张居中的纸，跟编辑页、诊断页同一个组件：

```
导入简历
[粘贴文本 | 上传文件]
  textarea
  [解析] [载入演示数据]
⚠ 结构识别不完整…

解析结果  [置信度 90%]              [保存到我的简历]
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
┊  张三                             ┊
┊  清华大学  计算机科学与技术        ┊
┊  · 主修数据结构与操作系统           ┊
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

- 纸上一整套都能改：抬头、公司、职位、时间、要点，能增删条目与要点
- 「保存」按钮从粘贴页签挪到纸旁边——解析完直接看着纸改、改完就存
- 结构问题在解析完列一次（快照，列在纸上方），保存时重算一遍带进编辑页

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-draft`: 「通过粘贴文本放入底稿」——解析后可在纸面上直接修改整份解析结果，并新增「解析后列出结构问题」
- `product-visual-language`: 「纸是内容的承载形式」——导入页也用纸承载解析结果

## Impact

**代码**

- `frontend/src/views/ImportView.vue`：解析结果区换成 `ResumeEditor`；保存按钮挪位；新增结构问题清单；删掉那套弱渲染的模板与样式
- `frontend/src/stores/draft.ts`：新增 `applyPendingChange`；`updatePendingBulletText` 删掉
- `frontend/src/components/ResumeEditor.vue`：新对象的标识来源随 draft 重建（重新解析会换掉整份 pending）
- `frontend/src/styles/main.css`：纸的"桌面底色"提成共享类，编辑页与导入页共用

**不受影响**

- 不改解析规则与解析结果的置信度
- 不改保存成底稿的语义（仍是覆盖或新建）
- 不改诊断页与版本页
- 不新增依赖
