## Why

`ResumeEditor.vue` 675 行、`CommentSidebar.vue` 441 行——两个组件都把「纸面编排」和「具体块的渲染」搅在一起。

P3 服务端化与 P4 引擎升级都要改这两个文件（服务端化要接真实账号态，引擎升级要加版本溯源展示）。不先拆，P3/P4 必然在这里撞车，且每次改动都要在一个 400 多行的文件里定位「哪段是编排、哪段是渲染」。

同时这是一次**零行为变化**的重构——43 个 `ResumeEditor` 用例、9 个 `CommentSidebar` 用例，加上各视图的用例，构成本次改动的安全网。

## What Changes

- `ResumeEditor.vue` 拆出 4 个组件，每个**正好填一个 slot 出口**，DOM 结构与类名完全不变：
  - `ContactList.vue` → `#profile-contacts`（联系方式的改与删）
  - `ItemDates.vue` → `#item-dates`（起止日期与「至今」）
  - `DeleteButton.vue` → `#item-delete` / `#bullet-delete`（带二次确认的删除入口）
  - `BulletComments.vue` → `#bullet-extra`（行内批注）
- `CommentSidebar.vue` 拆出 4 个组件：
  - `StructureFindingsPanel.vue` → 结构问题清单
  - `SidebarFilters.vue` → 严重度与类别筛选器
  - `SidebarEmpty.vue` → 未诊断 / 零意见两种空态
  - `CollapsedSidebar.vue` → 折叠态头部
- 样式随块搬迁：`resume-editor.css` 按归属拆到子组件的 `<style scoped>`；父组件只保留需要跨组件生效的 `:deep()` 规则

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。**这是纯重构，不改变任何用户可见行为**——规格里描述的每一条行为在拆分前后完全一致。

## 不做（与原计划的一处偏离）

原计划写的是抽 `ProfileHeader.vue`（姓名/定位/联系方式/增删联系方式）与 `ItemHeader.vue`（公司/职位/起止日期/条目删除）。**实施前的勘察发现这两个名字做不到**：

`ResumePreview.vue` 用 13 个具名 slot 把内容填进纸面结构。抬头区散在 4 个**互不相邻**的出口（姓名在 `<h1>` 里、定位在 `<p>` 里、联系方式在另一个 `<p>` 里、「新增联系方式」按钮甚至在 `</header>` **外面**），条目头散在 4 个出口（公司/职位/日期/删除）。

一个 Vue 组件只能落在**一个** slot 位置。所以要让 `ProfileHeader.vue` 同时渲染这 4 块，必须改 `ResumePreview` 的 slot API——而 `ResumePreview` 的 scoped 规则（如 `.paper-item-head.is-editable .paper-org :deep(.el-input)`）要求字段元素带自己的 scope id，字段一旦搬进子组件，这些规则连同打印样式一起失效。

细粒度方案（每个组件对应一个出口）能做到**DOM 零变化**，风险低得多。代价是组件名与原计划不同——但目标是「让 ResumeEditor 只剩纸面编排、事件编排与键盘流」，这个目标达成了。

## Impact

- **新增文件**：`components/ContactList.vue`、`ItemDates.vue`、`DeleteButton.vue`、`BulletComments.vue`、`StructureFindingsPanel.vue`、`SidebarFilters.vue`、`SidebarEmpty.vue`、`CollapsedSidebar.vue`
- **改动文件**：`components/ResumeEditor.vue`、`components/CommentSidebar.vue`、`components/resume-editor.css`、`components/ResumePreview.vue`（不动）
- **测试**：`components/ResumeEditor.spec.ts` 里 5 处直接读 `resume-editor.css` 源文件字符串的断言要改读的文件路径——**断言的行为不变，只改它去哪个文件读**
- **契约不变**：`ResumeEditor` 对外的 props/emits 与 `EditorFocusTarget` 导出保持原样；`CommentSidebar` 的 props/emits 名称保持原样（两个调用方用 kebab-case 绑定）
- **DOM 契约不变**：`anchor-item-*`、`anchor-bullet-*`、`paper-comment-*`、`bullet-input-*` 四类 id，以及 `.paper-action`、`.paper-comment`、`.structure-panel`、`.sidebar-collapsed` 等根元素类名，全部保持——焦点管理与现有测试都依赖它们
