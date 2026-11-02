## 1. 诊断状态显式化

- [x] 1.1 `frontend/src/domain/types.ts`: 新增 `DiagnosisState` 类型——`'none' | 'empty' | 'result'`
- [x] 1.2 `frontend/src/stores/draft.ts`: 新增 `diagnosisState` 计算属性并导出——`diagnosis` 为 null 时是 `none`，`liveIssues` 为空时是 `empty`，否则是 `result`
- [x] 1.3 `frontend/src/views/DiagnosisView.vue`: 删掉 `onMounted` 里的 `if (!draftStore.diagnosis) runDiagnosis()`，不再自动发起诊断
- [x] 1.4 `frontend/src/views/DiagnosisView.vue`: 页头操作区随状态变化——尚未诊断时显示「开始诊断」，已有诊断结果时显示「重新诊断」

## 2. 批注栏的空状态区分三种情况

- [x] 2.1 `frontend/src/components/CommentSidebar.vue`: 新增 `diagnosisState` prop 与 `emptyActionLabel` prop（默认「开始诊断」），新增 `start-diagnosis` emit
- [x] 2.2 `frontend/src/components/CommentSidebar.vue`: 空状态分支拆成两种——尚未诊断时显示「还没有诊断结果」与发起诊断的入口；诊断过但没有意见时显示「没有查出问题」与重新诊断的入口，不再说成还没有诊断结果
- [x] 2.3 `frontend/src/components/CommentSidebar.vue`: 自动折叠的条件从「没有任何批注」收窄为「诊断过且没有意见」；尚未诊断时侧栏保持展开，让引导入口可见
- [x] 2.4 `frontend/src/components/CommentSidebar.vue`: 空状态里的引导按钮改为 emit `start-diagnosis`，不再自己 `router.push('/diagnosis')`
- [x] 2.5 `frontend/src/views/DiagnosisView.vue`: 传入 `diagnosisState`；接上 `start-diagnosis` 触发诊断
- [x] 2.6 `frontend/src/views/DraftView.vue`: 传入 `diagnosisState`；接上 `start-diagnosis` 跳转到 `/diagnosis`；空状态按钮文案为「去诊断」

## 3. 清空诊断结果

- [x] 3.1 `frontend/src/stores/ui.ts`: 新增 `clearIssueMarks()`，清掉 `handledCommentIds` / `ignoredIssueKeys` / `activeCommentId` / `focusCommentId`
- [x] 3.2 `frontend/src/stores/draft.ts`: `clearDiagnosis()` 保持只清 `diagnosis` 一项，「已改」标记由它依附的诊断结果一并消失；补一行注释说明这层依赖
- [x] 3.3 `frontend/src/views/DiagnosisView.vue`: 页头加「清空诊断结果」文字按钮，仅在存在诊断结果时出现；点击后依次调 `draftStore.clearDiagnosis()` 与 `uiStore.clearIssueMarks()`，并给一条操作反馈

## 4. 测试

- [x] 4.1 `frontend/src/components/CommentSidebar.spec.ts`: 新增——尚未诊断时侧栏展开且显示发起诊断的入口；诊断过但零意见时显示「没有查出问题」且侧栏折叠；空状态按钮 emit `start-diagnosis`
- [x] 4.2 `frontend/src/views/DiagnosisView.spec.ts`: 新建——进入诊断页不自动诊断、纸面不带问题标记；点「开始诊断」后意见出现且纸面标出位置；点「清空诊断结果」后回到空状态，标记过已处理与已忽略的意见重新诊断后不再带这些标记
- [x] 4.3 `frontend/src/stores/draft.spec.ts`: 新增——`clearDiagnosis()` 清掉诊断结果，依附于它的「已改」标记随之消失

## 5. 验证

- [x] 5.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 5.2 浏览器实测：首次进入诊断页不自动诊断，纸面干净、右侧是「还没有诊断结果」与开始诊断的入口；点「开始诊断」出意见；把一条意见标记为已处理后清空，再重新诊断该意见不带已处理标记；窄屏（<1360px）下页头仍看得到「开始诊断」
