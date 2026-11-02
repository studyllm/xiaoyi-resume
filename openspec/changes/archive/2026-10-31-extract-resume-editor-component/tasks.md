## 1. 先钉住现有行为（重构的安全网）

这些行为现在只能靠整页断言覆盖。补在现有的 `DraftView.spec.ts` 上，改造前先跑绿，改造后把同一条行为改写成组件测试、页级那条随之删除。

- [x] 1.1 `frontend/src/views/DraftView.spec.ts`: 空要点失焦后被移除，且条目空了会一起消失
- [x] 1.2 `frontend/src/views/DraftView.spec.ts`: 空条目失焦后被移除
- [x] 1.3 `frontend/src/views/DraftView.spec.ts`: 删除条目会连带删掉它下面的要点
- [x] 1.4 `frontend/src/views/DraftView.spec.ts`: 联系方式可以新增与删除
- [x] 1.5 `frontend/src/views/DraftView.spec.ts`: 「至今」勾上后结束时间被禁用
- [x] 1.6 `frontend/src/views/DraftView.spec.ts`: 点纸面上的结构标注会选中右侧对应的批注
- [x] 1.7 `frontend/src/views/DraftView.spec.ts`: 批注可以标记已处理，也可以忽略（补这条时发现真 bug：忽略的键是 `ruleId@bulletId`，同一条规则的分区级意见共用一个键，忽略一条会把三条一起忽略掉；键改用意见自己的标识）
- [x] 1.8 `frontend/src/views/DraftView.spec.ts`: 批注栏折叠时列出各严重程度的条数
- [x] 1.9 `frontend/src/`: 跑 `npm run type-check` 与 `npm test`，确认新补的用例全绿

## 2. 简历编辑的纯函数

- [x] 2.1 `frontend/src/engines/editing.ts`: 定义 `DraftOp` 与 `applyOp(draft, op)`，返回新简历，不改传入对象
- [x] 2.2 `frontend/src/engines/editing.ts`: 把"删掉最后一条要点后条目空了就连带删条目"收进 `applyOp`，替换 `confirmDelete` 与 `onBulletBlur` 里的两份重复实现
- [x] 2.3 `frontend/src/engines/editing.ts`: 把"专业技能的新增落在已有技能行上，没有条目才建条目"收进 `applyOp`
- [x] 2.4 `frontend/src/engines/editing.spec.ts`: 每种 op 的单元测试，以及两条规则各自的用例

## 3. 编辑器组件

- [x] 3.1 `frontend/src/components/ResumeEditor.vue`: 新建组件。props `draft` / `issues` / `editable` / `focusTarget`，emits `change` / `select-comment` / `save-request`；不引入 pinia、router 与全局状态
- [x] 3.2 `frontend/src/components/ResumeEditor.vue`: 把 `DraftView` 的 8 个插槽内容搬进来（抬头、联系方式、分区标注、机构类字段、职位类字段、时间、删除、要点、要点批注、分区新增）
- [x] 3.3 `frontend/src/components/ResumeEditor.vue`: 编辑动作改为发 `change` 事件，不再直接调用 store
- [x] 3.4 `frontend/src/components/ResumeEditor.vue`: `focusTarget` 用 watch 实现定位：滚到要点、滚到分区、滚到批注并展开它
- [x] 3.5 `frontend/src/components/ResumeEditor.vue`: 行内批注的展开态搬进组件内部
- [x] 3.6 `frontend/src/components/ResumeEditor.spec.ts`: props 进 emits 出的行为测试——新增要点、新增条目、新增技能、二次确认删除、空壳清理、字段措辞、结构标注、行内批注与展开、focusTarget 定位（共 29 条，测试文件里没有 pinia、router 与登录）
- [x] 3.7 `frontend/src/components/ResumeEditor.spec.ts`: 断言挂载编辑器不需要 pinia、router 与登录态

## 4. 页面退化成装配层

- [x] 4.1 `frontend/src/stores/draft.ts`: 新增 `applyChange(next)`，负责替换内容、标记未保存、递增内容变更计数与持久化；现有写方法不动
- [x] 4.2 `frontend/src/views/DraftView.vue`: 只留页头、预览与编辑切换、保存与放弃修改、重新导入、批注侧栏接线（1099 行 → 202 行）
- [x] 4.3 `frontend/src/views/DraftView.vue`: 用 `focusTarget` 接住跨页定位请求（诊断页「去修改」、侧栏选批注、左侧分区目录）
- [x] 4.4 `frontend/src/views/DiagnosisView.vue`: 接线跟着改
- [x] 4.5 `frontend/src/views/DraftView.spec.ts`: 删掉已经改写成组件测试的页级用例，只留页面装配的用例

## 5. 验证

- [x] 5.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 5.2 浏览器实测：编辑页的行为与改造前一致——新增、删除、展开批注、点结构标注定位侧栏、保存与放弃修改、预览与编辑切换、诊断页「去修改」跳到编辑页并展开对应批注
- [x] 5.3 `frontend/src/flows.spec.ts`: 界面文案里不出现内部术语，样式里没有视觉字面量
