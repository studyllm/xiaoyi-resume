## 1. 解析结果换成纸

- [x] 1.1 `frontend/src/views/ImportView.vue`: 解析结果区换成 `ResumeEditor`（`:draft="draftStore.pending"`、`:editable="true"`、`@change`、`@save-request`）
- [x] 1.2 `frontend/src/views/ImportView.vue`: 「保存」按钮从粘贴页签挪到纸旁边；页签里留「解析」「载入演示数据」
- [x] 1.3 `frontend/src/views/ImportView.vue`: 解析成功后算一次结构问题（与编辑页同一口径：缺字段、时间对不上、时间重叠、没倒序），列在纸上方；解析器自己的警告照旧
- [x] 1.4 `frontend/src/views/ImportView.vue`: 低置信度提示的文案改成纸面的说法
- [x] 1.5 `frontend/src/views/ImportView.vue`: 删掉 `.preview-*` 那套弱渲染的模板与样式

## 2. 数据与标识

- [x] 2.1 `frontend/src/stores/draft.ts`: 新增 `applyPendingChange(next)`；删掉 `updatePendingBulletText`
- [x] 2.2 `frontend/src/stores/draft.spec.ts`: `updatePendingBulletText` 那条改成 `applyPendingChange`
- [x] 2.3 `frontend/src/components/ResumeEditor.vue`: 新对象的标识来源随 draft 重建，避免重新解析后与新 pending 的标识撞车
- [x] 2.4 `frontend/src/styles/main.css`: 纸的"桌面底色"提成共享类 `.paper-canvas`；`views/DraftView.vue` 改用它

## 3. 测试

- [x] 3.1 `frontend/src/views/ImportView.spec.ts`: 新建——解析后纸面出现、纸上改公司名 pending 跟着变、结构清单在解析后出现、保存按钮在纸旁边
- [x] 3.3 `frontend/src/components/ResumePreview.vue`: 编辑模式下抬头始终渲染（还没有姓名的时候也得有地方填）；预览模式不变
- [x] 3.2 `frontend/src/components/ResumeEditor.spec.ts`: 换一份新 draft 后新增要点，标识不与新 draft 撞车

## 4. 验证

- [x] 4.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 4.2 浏览器实测：解析 → 纸出现 → 改公司/时间/抬头 → 增删要点与条目 → 结构清单是快照 → 保存 → 编辑页侧栏里是重算后的清单
