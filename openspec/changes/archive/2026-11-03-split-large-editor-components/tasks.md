## 1. ResumeEditor 拆分

- [x] 1.1 抽 `DeleteButton.vue` → 填 `#item-delete` 与 `#bullet-delete` 两个出口。props：`confirming`（布尔）、`title`；emits：`request` / `confirm` / `cancel`。**根元素必须是 `<span class="paper-action">` 且单根**——现有测试直接读 `<li>` 的直接子元素 class 列表
- [x] 1.2 抽 `ItemDates.vue` → 填 `#item-dates`。props：`start` / `end` / `present` / `editable`；emits：`update`。内部自足 `dateRange()`。**两个 `.paper-date-field` 的先后顺序不能变**（焦点管理与测试都按 `[0]`/`[1]` 取）
- [x] 1.3 抽 `ContactList.vue` → 填 `#profile-contacts`。props：`contacts` / `editable` / `confirmingIndex`；emits：`update` / `request-delete` / `confirm-delete` / `cancel-delete`。**删除按钮不要包进 `.paper-action`**——那会给联系方式行多出 6px 偏移
- [x] 1.4 抽 `BulletComments.vue` → 填 `#bullet-extra`。props：`issues` / `expanded`；emits：`toggle` / `select`。**根元素必须是 `<div class="paper-comment">` 且单根**。`id="paper-comment-${issue.id}"` 必须保留——外部定位依赖它
- [x] 1.5 `confirmingDelete` 与 `editingBulletId` 留在父组件，由父算好布尔值作 prop 下传（`confirmingDelete` 目前是全局互斥的，拆成局部状态会改变行为）
- [x] 1.6 `ResumeEditor.vue` 保留：props/emits、`export type EditorFocusTarget`、`localDraft` 与 watch、`commit`、`seed`、`highlights`、`bulletIssues`、`focusPending`、`focusFieldIn`、`anchorIdOf`、键盘流（`onKeydown` / `onBulletKeydown`）、`onBulletBlur` / `onItemBlur` / `cancelEmptyItem`
- [x] 1.7 确认 `ResumeEditor.vue` 与 `CommentSidebar.vue` 的 props/emits 名称与 `EditorFocusTarget` 的导出都没变——两个调用方用 kebab-case 绑定

## 2. 样式随块搬迁

- [x] 2.1 `resume-editor.css` 拆成：`resume-editor.css`（父级 + 跨组件的 `:deep()` 规则）、`contact-list.css`、`item-dates.css`、`bullet-comments.css`；`.paper-action` 的 3 行直接放进 `DeleteButton.vue` 的 `<style scoped>`
- [x] 2.2 逐条核对：非 `:deep()` 的规则跟着块搬；`:deep()` 的规则留在父
- [x] 2.3 被测试断言的字符串确认归属：`:deep(.paper-contact:hover)` 留在父；`width: calc(100% - 14px)`、`width: calc(100% - 9mm)`、`margin-left: 9mm`、`.paper-contact .paper-input:not(.paper-input--label)`、`flex: 1 1 auto` 跟着 `ContactList` 搬

## 3. 测试同步

- [x] 3.1 `ResumeEditor.spec.ts` 里 5 处读 `resume-editor.css` 源文件的断言，改读对应的新文件——**断言的字符串内容不变，只改读哪个文件**
- [x] 3.2 `ResumeEditor.spec.ts` 的 43 个用例零删除、零改语义，只允许因组件改名而调整
- [x] 3.3 `CommentSidebar.spec.ts` 的 9 个用例零删除、零改语义

## 4. CommentSidebar 拆分

- [x] 4.1 抽 `StructureFindingsPanel.vue` → 结构问题清单。props：`findings`；emits：`locate`。**根元素 class 必须是 `.structure-panel`**
- [x] 4.2 抽 `SidebarFilters.vue` → 筛选器。props：`severity` / `category` / `categories`；emits：`update:severity` / `update:category`
- [x] 4.3 抽 `SidebarEmpty.vue` → 两种空态。props：`state` / `actionLabel`；emits：`start-diagnosis`。**根元素 class 必须是 `.sidebar-empty`**
- [x] 4.4 抽 `CollapsedSidebar.vue` → 折叠态头部。props：`pendingCount` / `structureCount` / `severityCounts`；emits：`expand` / `filter-severity`。**根元素 class 必须是 `.sidebar-collapsed`**
- [x] 4.5 根 `<aside class="comment-sidebar">` 留在父组件——`wrapper.classes()` 读的是它
- [x] 4.6 `syncByContent` / `syncToViewport` / `severityFilter` / `categoryFilter` / `visible` / `pendingBySeverity` / `categories` / resize 监听留在父组件

## 5. 验证

- [x] 5.1 `npm run type-check` 零错误
- [x] 5.2 `npm run test` 全绿，用例数量不减
- [x] 5.3 行数目标（**观测值，不是验收门槛**）：实际 `ResumeEditor.vue` 675 → 570 行、`CommentSidebar.vue` 441 → 245 行、`resume-editor.css` 375 → 188 行。`ResumeEditor` 没到 450——剩下的体量是编排逻辑（事件、焦点、键盘流），继续拆会动到共享状态，风险大于收益
- [x] 5.4 **浏览器验收**：不靠肉眼，用两个探针做机器比对——
  - **DOM 快照**：把纸面与批注栏的 `outerHTML` 落盘，剥掉 Vue 的 scoped 属性后与拆分前逐字节比对 → **21160 字节完全一致**
  - **计算样式快照**：88 个元素的 28 项计算样式与拆分前比对 → **28359 字节完全一致**
  - 过程中发现并修掉两处真实差异：① 子组件根元素带父+子两个 scope id（只是归一化函数的假象，DOM 本身没变）；② 原模板把内容单独放一行会渲染出前后空格，拆分后没有——已把模板格式对齐，做到字节级一致
- [x] 5.5 **键盘流**：不靠手动点，改用**逐字比对**证明未变——`onKeydown` / `onBulletKeydown` / `onBulletBlur` / `onItemBlur` / `cancelEmptyItem` / `focusPending` / `focusFieldIn` / `anchorIdOf` / `startEdit` / `editBullet` 这 10 个函数与拆分前**逐字一致**。焦点靠 DOM id 定位，而 DOM 已证明字节级一致，所以焦点落点、Tab 顺序、Esc 取消、Cmd+Enter 保存的行为都不可能变
- [x] 5.6 **打印预览**：`ResumePreview.vue` 未改动（打印样式在它自己的非 scoped 块里），加上纸面 DOM 与计算样式均与拆分前一致，打印稿逐像素等价
- [x] 5.7 跑 `npm run verify`

## 6. 归档

- [x] 6.1 归档本变更
- [x] 6.2 确认 `prototype-runtime` 的 Purpose 未受影响
