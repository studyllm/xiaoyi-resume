## Context

`frontend/src/views/DraftView.vue` 是仓库里最后一个"神"组件：它直接读写 `draftStore`（40 处 `draftStore.*`，含 11 个写方法）与 `uiStore`（17 处），并且通过 8 个插槽把纸面编辑、诊断痕迹和页面外壳搅在一起。

它的三个兄弟已经是受控组件了：

```
PaperField.vue       props: editable/value/placeholder/variant   →  emits: update
CommentSidebar.vue   props: issues/isHandled/isChanged/isIgnored  →  emits: select/edit/toggle-handled/ignore
DiagnosisComment.vue props: issue/active/handled/changed         →  emits: 4 个
```

所以这次改造不是引入新范式，是把最后一块拼上。

测绘结果（449 行脚本按责任分桶）：

| 桶 | 行数 | 内容 | 去向 |
|---|---|---|---|
| S1 纯数据加工 | 141 | highlights、structureFindings、bulletIssues、字段措辞、批注摘要 | 原样进组件 |
| S2 编辑动作 | 170 | 新增/删除/焦点/键盘流 | 改为 emit change |
| S3 编辑期状态 | 27 | editingBulletId、pendingFocus、confirmingDelete、展开态 | 进组件 |
| S4 跨页协议 | 58 | 诊断页跳进来、侧栏定位、目录跳分区 | 留在页面，改走 focusTarget |
| S5 页面职责 | 45 | 保存/放弃、重新导入、Cmd+Enter | 留在页面 |

约束：

- `frontend/src/flows.spec.ts` 会扫描 `views/`、`components/`、`layouts/` 的模板——模板里不能出现内部术语「底稿」，也不能出现题目类词；它还会扫描全部 `.vue`/`.css` 的样式，视觉字面量只能出现在 `styles/tokens.css`
- 纸面版式、诊断痕迹、保存语义、预览/编辑模式全部不变——这是纯重构
- 诊断结果只存在内存里（`draftStore.diagnosis`），刷新即失；这轮不碰

## Goals / Non-Goals

**Goals:**

- `mount(ResumeEditor, { props })` 就能测编辑器，不需要 pinia、router、登录态
- 简历规则（空壳清理、技能新增落点）从 DOM 事件里搬进纯函数，有自己的快速单测
- 页面层退化为装配层，DraftView 从 1099 行降到 200 行左右
- 不改任何用户可见行为

**Non-Goals:**

- 不做第二个使用方。导入页的解析结果预览现在用的是一套更弱的列表渲染（连纸都不是，改不了公司/职位/时间，不能增删条目），它将来能不能复用编辑器是下一轮的事
- 不动视觉快照测试。仓库没有这套工具链，纸面版式这轮刚改过，快照会一直飘
- 不重写 store 的 11 个写方法，不动 `stores/draft.spec.ts` 的 27 个测试
- 不动诊断引擎、解析引擎与版本生成

## Decisions

### D1 组件契约：props 进、emits 出，不碰全局状态

```ts
// components/ResumeEditor.vue
props: {
  draft: Draft                              // 内容
  issues?: DiagnosisIssue[] = []            // 诊断意见；缺省则纸上无标注、无行内批注
  editable?: boolean = false                // 是否可编辑
  focusTarget?: { type: 'bullet' | 'section' | 'comment'; id: string } | null = null
}
emits: {
  change: [draft: Draft]                    // 内容变了，整体替换
  'select-comment': [issue: DiagnosisIssue] // 点了纸上的行内批注或结构标注
  'save-request': []                        // Cmd/Ctrl+Enter
}
```

**为什么整体替换而不是细粒度事件**：细粒度要 9 种事件，父组件写 9 个 handler，测试断言的是"发了哪条消息"而不是"简历变成了什么样"。整体替换让组件变成纯函数式的：draft 进 → 操作 → draft 出，测试断言最终状态。

**为什么不 props 双向绑定**：这个仓库的兄弟组件都是单向 props + emits，跟着走。

**为什么不把批注栏塞进组件**：批注栏是"看诊断结果"，编辑是"改内容"，两者生命周期不同；而且 `CommentSidebar` 已经是受控组件，页面接线就行。纸面上的结构标注与行内批注则必须跟着纸走——它们就渲染在纸的插槽里。

### D2 预览/编辑模式留在页面，组件只收 `editable`

页头有「预览 / 编辑」切换按钮，那是页面级 UI。Cmd+Enter 的"保存"也是页面动作。所以组件无状态地接受 `editable`：它不关心自己处于哪个模式，只按 `editable` 决定渲染输入框还是文本。

**为什么不把 mode 交给组件管**：那样 Cmd+Enter 就得拆成"emit save + 组件自己退出编辑"，等于组件偷偷改了页面的状态。

### D3 跨页定位走 `focusTarget` 属性，不用 `defineExpose`

现在的四条跨页路径：诊断页「去修改」跳进来并展开对应批注、侧栏点批注定位到纸上、左侧分区目录跳到分区、`focusedBulletId` 变化时滚动到要点。

组件化后这些都变成"给组件一个指令"：

```
focusTarget = { type: 'bullet',  id }  → 滚动到该要点
focusTarget = { type: 'section', id }  → 滚动到该分区
focusTarget = { type: 'comment', id }  → 滚动到该批注并展开它
```

**为什么不用 expose 的方法**：诊断页是 `router.push('/draft')` 之后才由 DraftView 的 onMounted 消费请求，组件 ref 那一刻未必 ready，方法调用会落空。属性 + watch 没有时序问题。

**为什么不用 store 传**：组件不依赖全局状态是这次改造的验收标准。`focusTarget` 由页面从 `uiStore` 派生，组件只认属性。

### D4 简历规则搬进 `engines/editing.ts` 的纯函数

```ts
export type DraftOp =
  | { type: 'set-profile'; patch: Partial<DraftProfile> }
  | { type: 'add-contact'; contact: DraftContact }
  | { type: 'remove-contact'; index: number }
  | { type: 'set-item-meta'; sectionId; itemId; patch }
  | { type: 'set-bullet-text'; sectionId; itemId; bulletId; text }
  | { type: 'add-bullet'; sectionId; itemId }
  | { type: 'remove-bullet'; sectionId; itemId; bulletId }
  | { type: 'add-item'; sectionId }
  | { type: 'remove-item'; sectionId; itemId }

export function applyOp(draft: Draft, op: DraftOp): Draft   // 返回新对象，不改原对象
```

规则收进 `applyOp`：

| 规则 | 现在在哪 | 之后 |
|---|---|---|
| 删掉最后一条要点 → 条目空了且没有字段 → 连带删条目 | `confirmDelete` 与 `onBulletBlur` 各写一遍 | `applyOp` 里写一次 |
| 专业技能的新增落在已有技能行上，没有条目才建条目 | `addEntry` 里 | `applyOp` 里 |
| 空要点失焦后仍为空 → 移除 | `onBulletBlur` | `applyOp` 的 remove-bullet |

**为什么规则不留在组件里**：这些是简历语义（改完的简历不该留空壳、技能分区不该冒出公司名），不是界面语义。留在组件里就只能靠整页测试覆盖；搬出来就有几十毫秒的纯函数测试。

### D5 store 只新增 `applyChange`，现有写方法不动

```ts
function applyChange(next: Draft): void {
  commit({ ...next, revision: savedRevision.value + 1, updatedAt: new Date().toISOString() })
}
```

页面 handler 收到组件的 `change` 事件后调它。现有 11 个写方法保留——导入页的 `updatePendingBulletText`、JdView 的 `saveIfDirty`、以及 `stores/draft.spec.ts` 的 27 个测试都还在用它们。**既有测试零改动是这次改造的重要约束**：改写 store 会把一个纯重构变成重构 + 数据层迁移，风险和收益不成比例。

### D6 先钉行为，再搬代码

顺序是：先在现有页面上补齐那些"当前只能靠整页测"的行为（空对象自动移除、联系方式增删、删除条目连带删要点、批注标记已处理/忽略、结构标注点击定位、侧栏折叠态的严重度分布），确认它们在改造前就成立；组件化时把同一条行为改写成组件测试，页级那条随之删除。

**为什么不能反过来**：组件化会同时改掉行为的落点，没有安全网的话，出了问题分不清是"搬错了"还是"本来就错"。

### D7 组件测试的验收线

```
mount(ResumeEditor, { props: { draft, issues, editable: true } })
```

不出现 `createPinia()`、不出现 `createRouter()`、不出现 `session.login()`。这是"独立"的唯一硬指标——如果测试里还需要造全局状态，说明组件还有 store 依赖没摘干净。

## Risks / Trade-offs

- **[emit 契约不够用]** → 本轮只有一个使用方，契约按"够用"定；真出现第二个使用方时再扩，而不是现在预留一堆没人用的接口
- **[focusTarget 覆盖不了所有跨页场景]** → 四条路径目前都能表达成 `{type, id}`；如果以后出现"要同时定位到某个要点并展开某条批注"，再换成更通用的形式
- **[applyOp 返回新对象，store 里 draft.value 的引用会变]** → `changedBulletIds` 等 computed 都是按值比较，不受影响；`commit()` 本来就是整体替换
- **[组件化过程中行为漂移]** → D6 的安全网先钉住行为；组件化后页级测试与组件测试并存一轮，断言对得上再删页级那条
- **[`flows.spec.ts` 的界面文案扫描]** → 新组件模板不能出现「底稿」，样式只能引用 tokens；改完必须跑 `npm test`
- **[组件变大]** → ResumeEditor 预计 600 行上下，和现在的 PaperField（66）、CommentSidebar（288）不是一个量级。如果超过 700 行，考虑把"纸面编辑"再切成纸面渲染与编辑控件两层

## Migration Plan

纯前端重构，无数据迁移、无存储结构变化。改动集中在新增两个模块、瘦身一个页面、给 store 加一个方法。回滚即还原这几个文件。OpenSpec 归档时同步 `prototype-runtime` 主 spec。

## Open Questions

- 导入页的解析结果预览要不要换成同一套编辑器？那是组件化之后的第一个真实复用场景，届时可能发现 `issues` / `editable` 这两个 prop 不够用
- 组件要不要提供"只读渲染"的薄封装？`DiagnosisView` 与版本页现在直接用 `ResumePreview`，如果编辑器只读模式好用，可以让它们改用编辑器，少一层心智
- `ResumeEditor.vue` 实现完是 705 行（脚本 400 + 模板 305），样式拆到了 `components/resume-editor.css`。设计时估的是 600 行上下，超出的部分是编辑期状态与键盘流。将来如果还要长，可以把它们收进一个 `usePaperEditing` composable，本轮没做
- 结构标注目前落在条目行的最右端（删除按钮前面），不是紧贴缺失的那个字段。改插槽顺序可以挪过去，但那会动到纸面的版式，留给下一轮
