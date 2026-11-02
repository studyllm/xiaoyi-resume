## Why

编辑行为长在页面里，测它只能靠整页断言。

`frontend/src/views/DraftView.vue` 有 1099 行（脚本 449 + 模板 331 + 样式 316），同时管着页面外壳、纸面编辑、诊断呈现和批注侧栏接线四件事。它是整个仓库里唯一直接读写全局状态的组件——`PaperField`、`CommentSidebar`、`DiagnosisComment` 三个兄弟都已经是"props 进、emits 出"的受控组件，只有编辑器不是。

后果是测试只能在页面这一层做。`DraftView.spec.ts` 的 15 个测试里约 10 个其实是编辑器行为：Esc 取消空条目、回车新建要点、技能新增落在技能行、删除要点的二次确认、分区字段的措辞……每个断言都得先建 pinia、造登录态、解析一份简历、装一个 router，才能碰到纸面。2.6 秒跑 15 个测试，而同样数量的纯函数测试不到 300 毫秒。

更麻烦的是有几条简历规则藏在组件的 DOM 事件里，只能靠整页测试间接覆盖：删掉最后一条要点后条目空了要一起删（这条规则在 `confirmDelete` 和 `onBulletBlur` 里各写了一遍）、专业技能的新增要落在技能行上而不是新建条目、空对象失焦要自动移除。这些是简历语义，不是界面语义。

## What Changes

**把简历编辑抽成一个受控组件**

```
<ResumeEditor
  :draft="draft"                 ← 内容
  :issues="issues"               ← 诊断意见；缺省则纸上没有标注也没有行内批注
  :editable="editable"           ← 预览/编辑模式仍由页面掌管
  :focus-target="focusTarget"    ← 外部定位指令 {type, id}
  @change="(next) => draftStore.applyChange(next)"
  @select-comment="(issue) => …"
  @save-request="saveEdits"
/>
```

组件不碰 Pinia、不碰 router、不碰全局状态——`mount(ResumeEditor, { props })` 就能测。页面退化成装配层：页头、模式切换、保存/放弃、批注侧栏接线。

**把简历规则从 DOM 事件里搬进纯函数**

```
新增 frontend/src/engines/editing.ts
  applyOp(draft, op) → newDraft      纯函数，不改原对象
  ops: set-profile / add-contact / remove-contact / set-item-meta /
       set-bullet-text / add-bullet / remove-bullet / add-item / remove-item
  规则：删掉最后一条要点后条目空了就连带删条目（只写一次）
        专业技能的新增落在已有技能行上，没有条目才建条目
```

组件负责"用户做了什么"，`applyOp` 负责"简历应该变成什么样"。规则有独立的快速单测，组件测试断言的是"发出去的 draft 对不对"。

**store 只新增，不改旧**

```
组件 emit('change', nextDraft) → 页面 handler → draftStore.applyChange(nextDraft)
                                                          ├─ 替换 draft
                                                          ├─ 标记未保存
                                                          ├─ 递增内容变更计数
                                                          └─ 持久化
```

现有 11 个写方法原封不动，`stores/draft.spec.ts` 的 27 个测试与 `flows.spec.ts` 的 15 个测试零影响。

**测试重新分层**

```
现在                                       之后
引擎/领域/存储   345 个 纯函数             保持 + editing.spec.ts 约 12 个
组件              17 个                    + ResumeEditor.spec.ts 约 25 个
页面              15 个（2.6 秒）          5 个左右，只测装配
```

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `prototype-runtime`: 新增「编辑行为承载在可独立挂载的组件中」，规定编辑器通过属性与事件与外界对话，页面级职责不进入组件

## Impact

**代码**

- `frontend/src/engines/editing.ts`：新增。简历编辑的纯函数与规则
- `frontend/src/engines/editing.spec.ts`：新增
- `frontend/src/components/ResumeEditor.vue`：新增。受控的纸面编辑器
- `frontend/src/components/ResumeEditor.spec.ts`：新增
- `frontend/src/views/DraftView.vue`：1099 行 → 约 200 行的装配层
- `frontend/src/stores/draft.ts`：新增 `applyChange`；现有写方法不动
- `frontend/src/views/DiagnosisView.vue`：`focusTarget` 接线

**不受影响**

- 不改任何用户可见行为：预览/编辑两种模式、纸面版式、结构标注、行内批注、批注侧栏、保存与放弃修改的语义全部不变
- 不改诊断规则、解析规则与版本生成
- 不改领域模型与本地存储结构
- 不新增依赖

**风险**

- 事件契约一旦定下就是新的耦合点；本轮没有第二个使用方，所以契约按"够用且可扩展"来定，不预留
- `focusTarget` 用属性而不是 `defineExpose` 的方法，是为了避开挂载时序问题；诊断页跳转到编辑页这条路径要专门测
