## Context

上一轮 `2026-10-30-tidy-resume-editor-feedback` 把结构问题从顶部横幅改成了纸上的就地标注：

```html
<!-- ResumeEditor.vue 的 #item-extra 插槽 -->
<button class="paper-marker" :class="`paper-marker--${structureSeverity(...)}`">
  ⚠ {{ structureLabel(...) }}
</button>
```

样式在 `components/resume-editor.css`：

```css
.paper-marker {
  display: inline-flex; align-items: center; max-width: 45%; margin-left: 8px;
  ...
}
```

它在 `.paper-item-head`（flex 行）里，位置在公司、职位、时间之后、删除按钮之前。`max-width: 45%` 意味着标注最多吃掉那半行——正是公司名与职位输入框的宽度。产品负责人复查的结论是两条：

1. **时机不对**：新增一段教育经历，纸面立刻跳出「缺少专业、缺少学校名称」，用户还没写。
2. **位置不对**：标注和内容抢宽度，**编辑简历的显示区域被结构问题占掉了**。

原则：**优先保证简历内容编辑的显示区域**。

已经确定的产品决策：提示落在右侧批注栏顶部的一块清单；不拦保存；行内批注（诊断意见）保留。

相关现状：

- `engines/structure.ts` 的 `findStructureFindings(draft)` 是结构检查的唯一出处，诊断引擎也在用它（`diagnose.ts` 把 findings 折成意见）
- `CommentSidebar.vue` 是右侧栏，props 是 `issues: DiagnosisIssue[]` 等诊断相关的东西，只在编辑模式出现
- `DraftView.saveEdits()` 现在是「保存 → 提示已保存 → 切到预览」
- `ResumeEditor` 的 `EditorFocusTarget` 现在支持 `bullet` / `section` / `comment` 三种

## Goals / Non-Goals

**Goals:**

- 编辑过程中，纸面只有简历内容，一个结构问题的字都不出现
- 结构问题在保存时检查一次，结果显示在右侧栏顶部
- 清单里每一条都能点了直接跳到缺的那个格子
- 保存不拦；内容先存下来
- 纸面上条目头那行还给内容本身

**Non-Goals:**

- 不改结构规则本身（规则、严重度、措辞）
- 不改行内批注的形态
- 不做实时的清单
- 不动诊断页与版本页

## Decisions

### D1 纸面标注整个删掉，连插槽一起删

`ResumeEditor` 的 `#section-extra` / `#item-extra` 两个插槽内容全部去掉，`ResumePreview` 里这两个插槽也一并删掉——全仓库只有结构标注在用它们，留着就是两个没人填的洞。

随之没用的还有：`structureFindings` / `structureBySection` / `structureByItem` 三个 computed、`focusStructure`、`structureLabel` / `structureSeverity` / `sectionStructure` / `itemStructure` / `focusSectionStructure` / `focusItemStructure`，以及 `resume-editor.css` 里的 `.paper-marker` 三个规则。

**为什么不留在纸面上但做得更小**：问题不是"标注太大"，是"编辑时不该有标注"。用户写一段经历的过程中，缺字段是必然状态，提醒他没有意义。

### D2 检查延后到保存，清单是快照

```
保存 → draftStore.checkStructure() → 存下这次的结果 → 侧栏顶部渲染这份清单
```

清单是**上一次保存时的快照**。用户接着补字段时清单不会实时变短，要再保存一次才更新。

**为什么不做实时**：实时就回到了"边写边提醒"。清单标题写明「保存时发现的 N 处问题」，用户知道它是哪一版的结果。

**为什么结果放内存态**：结果完全由当前简历算得出来，不需要持久化；放进 `draftStore` 跟着简历走，离开页面再回来还在。

### D3 清单在右侧栏顶部，与批注上下分区

```
┌───────────────────────┐
│ ⚠ 保存时发现的 3 处问题 │   ← 新的这一块
│ · 教育经历「清华」缺少专业 │
├───────────────────────┤
│ 批注 4 · 待处理 2       │   ← 原来的批注区
│ 高 责任无结果 …         │
└───────────────────────┘
```

`CommentSidebar` 增加 `structureFindings` prop 与 `locate` emit。放在批注区上面，因为它是"刚保存完发现的、更紧急"；用分隔线与批注区分开，因为两者性质不同：一个是简历本身缺东西，一个是内容写得不够好。

侧栏折叠成 56px 窄条时，计数区里多一个结构问题计数，与现有的严重度分布并列——折叠起来也要知道里面有什么。

### D4 每条问题带一个 field，点了直接跳到那个格

`StructureFinding` 增加 `field`：

| 规则 | field |
|---|---|
| `missing-org` | `org` |
| `missing-title` | `title` |
| `missing-start` | `start` |
| `end-before-start` | `end` |
| `no-bullets` / `not-reverse-chronological` / `overlapping-experience` | 无，指向条目 |
| `empty-section` | 无，指向分区 |

**为什么放在引擎里而不是页面里**：规则与"该在哪补"是同一件事的两面，放在一起才不会各自漂移。规则、严重度、措辞都不动。

编辑器的定位指令扩成可辨识联合，多两种：

```ts
| { type: 'item'; id: string }
| { type: 'field'; sectionId: string; itemId: string; field: 'org' | 'title' | 'start' | 'end' }
```

定位到字段的实现：滚到 `#anchor-item-${itemId}`，再按字段找输入框——`.paper-org input`、`.paper-title input`、`.paper-date-field input`（第 0 个是开始、第 1 个是结束）。

### D5 保存后：有问题就留在编辑模式，没问题才切预览

```
保存 → checkStructure()
     ├─ 有问题 → 留在编辑模式（清单就在眼前，可以逐条点进去补）
     └─ 没问题 → 切到预览，看成品
```

保存按钮与 Cmd/Ctrl+Enter 走同一条路径（编辑器 emit `save-request` → 页面的 `saveEdits`）。

**为什么有问题时留在编辑模式**：清单在右侧栏，切到预览侧栏就消失了，用户得切回来才看得见要补什么。

**为什么不拦保存**：简历是用户自己的事实，缺一个"专业"字段不该拦住他保存。

### D6 提示只有一个出处

页头预览模式里的「N 处结构问题」删掉——上一轮把它和纸面标注放在一起是为了"纸面有标注、页头有计数"互相印证，现在纸面没有了，页头那个计数只会让人在预览时看到一堆自己暂时没法处理的数字。

## Risks / Trade-offs

- **[保存后不再自动切预览]** → 这是本轮明确的行为变化。补完所有问题再保存一次就会切预览，收工体验不变
- **[清单是快照，补完字段不会立刻消失]** → 标题写明「保存时发现的」；再保存一次就更新
- **[清单与诊断意见混在同一栏]** → 用分隔线与各自的标题分开；两者都是"待处理的事"，放一栏合理
- **[删掉两个插槽]** → 全仓库只有结构标注在用（grep 确认），诊断页与版本页用的是纯 `ResumePreview`
- **[结构问题在编辑时完全不可见]** → 这正是要的效果；用户要提前知道可以主动去诊断页看结构类意见

## Migration Plan

纯前端改造，无数据迁移。结构检查的规则与出处不变，只是触发时机与展示位置变了。回滚即还原这几个文件。

## Open Questions

- 预览模式下要不要也能看到保存时发现的清单？现在预览没有侧栏，去了就看不到。留作下一轮
- 诊断页的批注里也包含结构类意见（`missing-org` 等），保存时的清单与它们措辞一致但来源不同。将来要不要把保存时的检查直接并进诊断结果、只留一处，暂时不动
