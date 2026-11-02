## Context

现状：诊断页 `DiagnosisView.vue` 在 `onMounted` 里执行 `if (!draftStore.diagnosis) runDiagnosis()`，用户一进入就自动跑一遍。同时 `resume-comment-anchoring` 的既有规格里已经写着「系统不自动发起诊断」——那条场景写的是编辑页，实现却在诊断页上自动跑了，规格与实现在这一处本来就有出入。

诊断结果一旦产生就没有整体收起的入口。批注一直挂在纸上，用户只能逐条「忽略」，或者一条条点「已处理」。`draftStore.clearDiagnosis()` 早已存在却没有任何调用者，是一段悬空的原语。

诊断相关状态分散在两个 store：

```
draftStore (stores/draft.ts)
  diagnosis            诊断结果本体
  changedBulletIds     「已改」标记，从 diagnosis.issues[].quote 与当前正文比对得出
  liveIssues           过滤掉锚点已消失的意见

uiStore (stores/ui.ts)
  handledCommentIds    用户标记「已处理」
  ignoredIssueKeys     用户标记「忽略此条」
  activeCommentId      当前选中的批注
  focusCommentId       从批注跳转过来时要聚焦的批注
```

后三项与诊断结果一一对应，诊断一清就失去意义。`changedBulletIds` 依附于 `diagnosis`，随诊断结果一并消失。

批注栏 `CommentSidebar` 目前只看得见 `issues` 列表，分不清「尚未诊断」与「诊断过但零意见」——两者都走 `issues.length === 0` 分支，都显示「还没有诊断结果 / 去诊断」。诊断跑完却一条意见没查出时，用户会以为诊断根本没跑。

批注栏的自动折叠由 `issues.length + structureFindings.length === 0` 驱动，尚未诊断时同样触发，空状态里的引导会被折进 56px 窄条。`NARROW_WIDTH = 1360`，1360px 以下首次进入诊断页看不到引导。

批注栏空状态的引导按钮固定 `router.push('/diagnosis')`，在诊断页上是个死按钮。

## Goals / Non-Goals

**Goals:**

- 诊断成为用户显式触发的动作，进入诊断页不再产生副作用。
- 尚未诊断与诊断后零意见在界面上可区分，文案与引导动作都不同。
- 尚未诊断时，空状态的引导入口始终可见。
- 给诊断结果一个整体的收起入口，连带清除依附于它的用户标记。
- 批注栏空状态的引导动作由页面决定，组件不再自己跳转。

**Non-Goals:**

- 不改诊断规则、锚定逻辑、批注排序，也不改诊断结果的产出内容。
- 不改诊断结果的持久化策略——仍然不落盘，刷新后回到尚未诊断。
- 不做跨页的诊断意图传递。从编辑页「去诊断」跳到诊断页后仍需用户再点一次「开始诊断」。
- 不调整「重新诊断」与过期提示的既有行为，只调整页头按钮组的构成。
- 不改保存时的结构检查（`checkStructure`）流程。

## Decisions

### 决策一：诊断状态是三态，不是二态

批注栏需要知道自己该说哪句话，因此在 store 之外显式传入一个状态：

```ts
type DiagnosisState = 'none' | 'empty' | 'result'
```

| 状态 | 判定 | 批注栏文案 | 引导动作 |
| --- | --- | --- | --- |
| `none` | `diagnosis === null` | 还没有诊断结果 | 发起诊断 |
| `empty` | `diagnosis !== null` 且 `liveIssues` 为空 | 没有查出问题 | 重新诊断 |
| `result` | `diagnosis !== null` 且 `liveIssues` 非空 | （正常列表） | — |

放在页面层计算后作为 prop 传给批注栏，而不是让批注栏自己去摸 store：批注栏被诊断页与编辑页共用，两边对「发起诊断」的理解不同（诊断页要跑诊断，编辑页要跳转到诊断页），由页面决定更清楚。

`empty` 的判定用 `liveIssues` 而不是 `issues`：`liveIssues` 已经过滤掉了锚点随删除而消失的意见，所以「诊断过五条但用户把相关要点都删了」也归入 `empty`。这与过期提示条同时出现的场景是可接受的——过期提示已经说明了简历被改过。

### 决策二：自动折叠的条件收窄

原先 `issues.length + structureFindings.length === 0` 触发折叠。改为只有「诊断过且没有意见」才折叠：

```
诊断过 && 没有意见   → 折叠
尚未诊断              → 保持展开（引导要可见）
```

`uiStore.autoCollapseSidebar` 已经有 `sidebarAutoCollapsed` 标志位来区分「自动折叠」与「用户手动折叠」，展开时不会互相打架，这个机制继续沿用。

需要注意 `syncToViewport()` 在 `onMounted` 与 `resize` 时按视口宽度调用 `autoCollapseSidebar(window.innerWidth < 1360)`。宽屏下它会以 `false` 调用，若此时 `sidebarAutoCollapsed` 仍为 `true`（此前被空状态自动折叠过），会把侧栏重新展开。这一行为在改造后仍存在，但不再影响尚未诊断的场景——尚未诊断时侧栏本来就该是展开的。

### 决策三：清空跨两个 store，放在页面层编排

`clearDiagnosis()` 原本只在 `draftStore` 里，且只清 `diagnosis` 一项。现在需要连带清除 uiStore 里的三个状态。

不把 uiStore 的清理塞进 draftStore：draftStore 已经在 `stores/draft.ts` 里引用 `useUiStore()`（`stores/ui.ts` 不反向依赖 draftStore，单向引用不会成环），但把「已处理 / 已忽略」这类纯界面状态收到 draft store 里，职责上是错的。

改为：

```
draftStore.clearDiagnosis()      清 diagnosis（已改标记随之消失）
uiStore.clearIssueMarks()        清 handledCommentIds / ignoredIssueKeys / activeCommentId / focusCommentId
```

由页面的清空动作依次调用两者，并给出操作反馈。清空不做二次确认：它不触碰简历数据，重新诊断即可完全恢复，加确认框只会打断「收起意见」这个简单意图。

### 决策四：页头按钮组随状态变化

诊断页页头的操作区随诊断状态变化：

| 状态 | 按钮 |
| --- | --- |
| 尚未诊断 | 「开始诊断」（主要） |
| 已有结果 | 「重新诊断」（主要）+「清空诊断结果」（文字按钮） |
| 结果已过期 | 「重新诊断」（主要）+「清空诊断结果」（文字按钮）+ 顶部过期提示条内的「重新诊断」 |

「清空诊断结果」用文字按钮而非删除样式：它清掉的是派生结果，不是用户数据，不该带危险色。

### 决策五：批注栏空状态抛事件，不自己跳转

`CommentSidebar` 的空状态按钮此前固定 `router.push('/diagnosis')`，在诊断页上是死按钮。改为向页面抛事件：

```
CommentSidebar
  props:  diagnosisState: DiagnosisState
          emptyActionLabel?: string      默认「开始诊断」
  emits:  start-diagnosis
```

诊断页的处理是执行诊断，编辑页的处理是跳转到诊断页。两个页面的空状态按钮文案因此不同：诊断页是「开始诊断」，编辑页是「去诊断」。

### 决策六：现有规格与实现的出入已经存在

`resume-comment-anchoring` 的既有场景「还没有诊断结果时给出下一步」里已经写着「系统不自动发起诊断」，但那条场景限定在编辑页。改造后这条规则在诊断页同样成立，本次在 `draft-diagnosis` 里把它提升为一条独立需求，编辑页的既有场景保持不变。

## Risks / Trade-offs

- **从编辑页去诊断变成两步。** 用户明确表达了「我要诊断」的意图，却要多点一次。取舍是：所有入口的规则完全一致（「诊断永远是显式动作」），不需要引入跨页的意图传递机制；代价是明确的意图被要求确认两次。若日后认为体验不可接受，加一个一次性的意图标记即可，与现有的 `requestEditMode` / `consumeEditRequest` 模式一致。

- **自动折叠的行为在窄屏上仍然会收起侧栏。** 视口小于 1360px 时 `syncToViewport()` 会把侧栏折成窄条，尚未诊断时用户看到的仍是窄条而不是完整的空状态。页头的「开始诊断」主按钮在这种视口下依然可见，不至于无从下手；但空状态的说明文案在窄屏上看不全。

- **`empty` 状态可能对用户不诚实。** 诊断出五条意见、用户删掉了全部相关要点之后，界面会说「没有查出问题」，而实际情况是「查出过，但问题连同内容一起没了」。这种情况通常伴随简历被修改，因此过期提示条会同时出现，能给出部分解释。

- **清空会丢掉用户已经处理过的进度。** 这是本次明确的选择：清空是整体的、彻底的清空。意见 ID 是确定性构造的（`ruleId@anchor`），重新诊断后同样的意见会以同样的 ID 回来，用户需要重新标记一次。

- **诊断结果仍不落盘。** 刷新页面后回到尚未诊断状态，这与「默认不自动诊断」是一致的：诊断是一次性的、显式的动作。但这也意味着用户每刷新一次就要重新点一次「开始诊断」。这一点本次不处理。
