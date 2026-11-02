## 1. 保存语义

- [x] 1.1 `frontend/src/stores/draft.ts`：引入 `savedRevision`、`savedSnapshot` 与 `dirty` 三个状态；改动只更新内存中的 `draft` 并置 `dirty`，不再逐次递增修订号
- [x] 1.2 同文件：新增 `saveEdits()`，把修订号递增一次、把内容写入本地存储、把 `savedSnapshot` 更新为当前内容、清除 `dirty`
- [x] 1.3 同文件：新增 `discardEdits()`，把 `draft` 恢复为 `savedSnapshot` 并清除 `dirty`
- [x] 1.4 同文件：恢复存档时用已保存的修订号初始化 `savedRevision` 与 `savedSnapshot`
- [x] 1.5 补单测：连续修改后修订号不变；保存后修订号递增一次；放弃后内容回到上次保存的状态

## 2. 纸上的新增与删除入口

- [x] 2.1 `frontend/src/components/ResumePreview.vue`：增补插槽——分区末尾的新增入口、条目末尾的新增入口、条目与要点的删除入口
- [x] 2.2 `frontend/src/views/DraftView.vue`：接入四个分区的新增入口，措辞分别为「新增一段教育经历」「新增一段工作经历」「新增一个项目」「新增一条技能」
- [x] 2.3 同视图：专业技能分区的新增落在要点层（该分区没有条目层）
- [x] 2.4 同视图：条目与要点的删除入口，悬停出现；删除采用二次点击确认
- [x] 2.5 同视图 + `frontend/src/stores/draft.ts`：新增 `liveIssues`，删除条目或要点后，批注栏里对应的意见同步移除
- [x] 2.6 补单测：新增要点、条目、技能行各一例；删除条目与要点各一例；新增得到新标识且不与已有冲突；删除后对应批注消失

## 3. 空对象与键盘流

- [x] 3.1 `frontend/src/views/DraftView.vue`：新增的空要点显示「点此写一条要点」占位，空条目的字段显示各自占位
- [x] 3.2 同视图：空要点与空条目失焦后仍为空则自动移除；填了内容的不会被移除
- [x] 3.3 同视图：`Esc` 取消当前空的要点或空条目；已有内容时 `Esc` 只退出编辑，不删内容
- [x] 3.4 同视图：`Enter` 在要点编辑状态下于下方新建一条要点并聚焦，`Shift+Enter` 在要点内换行
- [x] 3.5 同视图 + `frontend/src/components/ResumePreview.vue`：要点文本在编辑模式可聚焦，`Tab` / `Shift+Tab` 在条目头字段之间与要点之间移动焦点
- [x] 3.6 同视图：`Cmd/Ctrl+Enter` 保存并退出编辑模式

## 4. 保存与未保存的界面反馈

- [x] 4.1 `frontend/src/views/DraftView.vue`：编辑模式的页头出现「保存」与「放弃修改」；「重新导入简历（覆盖）」只在预览模式出现
- [x] 4.2 同视图：存在未保存的修改时，修订号标签显示未保存标记
- [x] 4.3 `frontend/src/router/index.ts` + 新增 `frontend/src/components/UnsavedChangesDialog.vue`：路由离开时若存在未保存的修改，弹窗提供「保存并离开」「放弃修改并离开」「留在本页」三个选择
- [x] 4.4 同文件：页面刷新时若存在未保存的修改，给出浏览器原生提示

## 5. 生成版本与导出前自动保存

- [x] 5.1 `frontend/src/stores/versions.ts`：生成版本前若存在未保存的修改，先保存；版本记录的是保存后的修订号
- [x] 5.2 `frontend/src/views/VersionDetailView.vue`：导出 PDF 前若存在未保存的修改，先保存并提示

## 6. 验证

- [x] 6.1 `npm run type-check`、`npm test`、`npm run build` 全部通过
- [x] 6.2 浏览器实测：三类新增入口可用；新增后焦点落位；空对象自动清理；删除需二次确认
- [x] 6.3 浏览器实测：连续输入不改变修订号；保存后修订号递增一次；放弃后内容回退；离开页面有未保存提示
- [x] 6.4 回归：诊断规则、批注内容、版本与导出能力不变；上一轮丢失的增删入口已补回
