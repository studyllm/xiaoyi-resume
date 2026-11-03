## Context

`ResumeEditor.vue` 675 行、`CommentSidebar.vue` 441 行。两者都把「纸面编排」和「具体块的渲染」混在一起。

P3 服务端化要接真实账号态、P4 引擎升级要加版本溯源展示，两个都要改这两个文件。不先拆，后面必然撞车。

### 关键结构事实

`ResumePreview.vue` 用 **13 个具名 slot** 把内容填进纸面结构。两个组件的 template **几乎全是 slot 填充**——`ResumeEditor` 自己只有一个根 `div.resume-editor`，`CommentSidebar` 的结构问题清单、折叠态头部、筛选器、空状态、意见列表各自成块。

| slot 出口 | 位置 | 父元素 |
| --- | --- | --- |
| `profile-name` | `<h1 class="paper-name">` 内 | 抬头区 |
| `profile-headline` | `<p class="paper-headline">` 内 | 抬头区 |
| `profile-contacts` | `<p class="paper-contacts">` 内 | 抬头区 |
| `profile-add` | **在 `</header>` 之外** | 抬头区 |
| `item-org` / `item-title` / `item-dates` / `item-delete` | 4 个出口 | 同一个 `<div class="paper-item-head">` |
| `bullet` / `bullet-delete` / `bullet-extra` | 3 个出口 | 同一个 `<li>` |
| `item-add` | `<div class="paper-item">` 内 | 条目 |
| `section-add` | `<section class="paper-section">` 内 | 分区 |

**「新增联系方式」按钮在 `</header>` 外面**——现有测试专门断言这一点（`ResumeEditor.spec.ts:356`）。

### 样式归属机制

`resume-editor.css`（376 行）通过 `<style scoped src="...">` 引入。scoped 编译成 `.foo[data-v-hash]`：

- **slot 内容在父组件的编译单元里生成**，所以现在 slot 里的元素带父组件的 scope id
- 搬进子组件后，那些元素带子组件的 scope id，**父组件里不带 `:deep()` 的规则立刻失效**
- 带 `:deep()` 的规则能穿透组件边界 —— 只要目标元素还在父组件的 DOM 子树内就仍然生效

`CommentSidebar.vue` 的 scoped 样式则**一条 `:deep()` 都没有**（除了 `.sidebar-filters :deep(.el-select)`），所以它的块搬进子组件时，对应规则必须整块一起搬。

### 测试对内部结构的依赖

`ResumeEditor.spec.ts` 有 **5 处直接读 `resume-editor.css` 源文件字符串**（`toContain('.resume-editor.is-editable :deep(.paper-item-head)')` 之类）。样式搬走，这些断言就要改读的文件路径——**断言的行为不变，只改它去哪个文件读**。

还有 3 处断言直接读 `<li>` 的**直接子元素 class 列表**（`children.indexOf('paper-action')`），所以子组件的**根元素**必须是那个 class，且尽量单根（Fragment 多根会让 `el.className` 变成空）。

## Goals / Non-Goals

**Goals:**

- `ResumeEditor` 只剩纸面编排、事件编排与键盘流
- DOM 结构、元素类名、id、可访问性属性**完全不变**
- 现有 43 + 9 个用例零删除、零改语义

**Non-Goals:**

- 不改任何用户可见行为
- 不改 `ResumePreview` 的 slot API
- 不动 `ResumePreview` 的 scoped 规则与打印样式
- 不顺手删死代码（`.paper-input--name` / `.paper-input--org`）—— 那是另一次变更

## Decisions

### 决策 1：每个组件正好填一个 slot 出口

这是让 DOM 零变化的唯一办法。

| 组件 | 落点 slot | 搬走的父逻辑 | 搬走的 CSS |
| --- | --- | --- | --- |
| `ContactList.vue` | `#profile-contacts` | `setContact` / `contactKey` / `confirmDeleteContact` | 1–5、8–19、30–32、66–88 |
| `ItemDates.vue` | `#item-dates` | `dateRange` | 1–5、34–64 |
| `DeleteButton.vue` | `#item-delete` / `#bullet-delete` | — | 155–157 |
| `BulletComments.vue` | `#bullet-extra` | `severityOf` / `bulletStripSummary` / `bulletCommentIds` | 159–260 |

**不用 `ProfileHeader.vue` / `ItemHeader.vue` 这两个名字**：抬头区散在 4 个互不相邻的出口，条目头散在 4 个出口，一个 Vue 组件只能落在一个位置。要让一个组件渲染其中 4 块，就得改 `ResumePreview` 的 slot API，而 `ResumePreview` 的 scoped 规则（如 `.paper-item-head.is-editable .paper-org :deep(.el-input)`）要求字段元素带自己的 scope id——字段一旦搬进子组件，这些规则连同打印样式一起失效。

### 决策 2：`confirmingDelete` 与 `editingBulletId` 留在父组件

两个都是**跨块共享的状态**：

- `confirmingDelete` 目前是**全局互斥**的——正在确认要点删除时，条目的删除按钮会显示成普通垃圾桶（因为 `confirmingDelete !== item.id`）。拆成各子组件本地状态就会出现「条目和要点同时显示确认删除」= 行为变化
- `editingBulletId` 决定要点渲染 textarea 还是 span

做法：父组件算好 `confirming` / `editing` 布尔值作为 prop 下传。

### 决策 3：焦点不需要 inject/provide

`focusPending()` 与 `focusFieldIn()` **完全基于 DOM id 与类名**，不受组件边界影响：

- `anchor-item-*` / `anchor-bullet-*` 由 `ResumePreview` 渲染，不动
- `bullet-input-*` 在 `ResumeEditor` 的 textarea 上 —— 拆出去时必须一起搬 `:id`
- `focusFieldIn()` 依赖 `.paper-org` / `.paper-title` / `.paper-date-field` 的**先后顺序** —— 两个日期选择器的顺序不能变（`[0]` 是开始、`[1]` 是结束）

**唯一要跨组件传的是 `editingBulletId`**，作为 prop 下传即可。

### 决策 4：样式整块搬进子组件，父组件只留跨组件规则

- **不带 `:deep()` 的规则** → 跟着块搬进子组件的 `<style scoped>`
- **带 `:deep()` 的规则** → 留在 `resume-editor.css`（它们本来就能穿透）

被测试断言的那几条字符串（`:deep(.paper-contact:hover)`、`width: calc(100% - 14px)`、`width: calc(100% - 9mm)`、`margin-left: 9mm`、`.paper-contact .paper-input:not(.paper-input--label)`、`flex: 1 1 auto`）需要单独确认：
- `:deep(.paper-contact:hover)` 是 deep 形式 → 留在父 ✓
- 其余几条是非 deep → 跟着 `ContactList` 搬走 → **测试断言要改读新的文件**

所以 `resume-editor.css` 会拆成多个文件，测试里那 5 处断言改为读对应的新文件。

### 决策 5：`CommentSidebar` 拆 4 个组件

| 组件 | 落点 | props | emits | 搬走的 CSS |
| --- | --- | --- | --- | --- |
| `StructureFindingsPanel.vue` | 结构问题清单 | `findings` | `locate` | 351–401 |
| `SidebarFilters.vue` | 筛选器 | `severity` / `category` / `categories` | `update:severity` / `update:category` | 409–418 |
| `SidebarEmpty.vue` | 两种空态 | `state` / `actionLabel` | `start-diagnosis` | 420–434 |
| `CollapsedSidebar.vue` | 折叠态头部 | `pendingCount` / `structureCount` / `severityCounts` | `expand` / `filter-severity` | 282–335、403–407 |

留在父的：`syncByContent` / `syncToViewport` / `severityFilter` / `categoryFilter` / `visible` / `pendingBySeverity` / `categories` / resize 监听。

`CommentSidebar` 拆分比 `ResumeEditor` 简单：它直接用 `useUiStore()`（Pinia 全局），子组件可以自己拿折叠态与选中态，不需要一层层传 prop。

**根 `<aside class="comment-sidebar">` 必须留在父** —— `CommentSidebar.spec.ts:126/134/139` 读 `wrapper.classes()`。

## Risks / Trade-offs

- **子组件根元素的 class 写错 → 现有测试立刻红**。这是好事：它把「DOM 不能变」变成了可执行的约束。
- **`scoped` 样式搬漏 → 视觉回归，且静态测试抓不到** → 必须浏览器验收，不能只跑测试。
- **行数不是验收条件**。它只写进任务描述作为目标值：ResumeEditor < 450、CommentSidebar < 350。真正的门槛是「现有用例零删除零改语义」与「DOM 不变」。
- **测试断言改了路径** → 审查时要确认改的是「读哪个文件」而不是「断言什么」。

## Migration Plan

无数据迁移、无接口变更、无 props/emits 变更。

回滚策略：还原两个组件文件与样式文件即可。

## Open Questions

- `resume-editor.css` 拆成几个文件最合适？倾向按组件拆成 `resume-editor.css`（父）+ `contact-list.css` + `item-dates.css` + `bullet-comments.css`，删除按钮的样式只有 3 行，直接放回 `DeleteButton.vue` 的 `<style scoped>` 里。
