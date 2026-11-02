## 1. 删除入口统一成垃圾桶图标

- [x] 1.1 `frontend/src/styles/main.css`: 删除图标的共享样式——淡色常显，悬停变警示色
- [x] 1.2 `frontend/src/components/ResumeEditor.vue`: 条目与要点的删除从文字「删除」改成垃圾桶图标
- [x] 1.3 `frontend/src/components/ResumeEditor.vue`: 联系方式的删除补上二次确认，与条目、要点一致
- [x] 1.4 `frontend/src/components/resume-editor.css`: 删掉 `delete-reveal`（删除入口不再靠悬停出现）
- [x] 1.5 `frontend/src/views/VersionsView.vue`: 卡片上的删除从文字「删除」改成垃圾桶图标

## 2. 版本卡片的底部重排

- [x] 2.1 `frontend/src/views/VersionsView.vue`: 底部拆成「生成时间一行」与「操作一行」

## 3. 测试

- [x] 3.1 `frontend/src/components/ResumeEditor.spec.ts`: 删除入口一律是垃圾桶图标且常显；点图标进入确认态、取消后恢复；联系方式的删除要走确认
- [x] 3.2 `frontend/src/views/VersionsView.spec.ts`: 新建——卡片上时间与操作分行；删除入口是图标

## 4. 验证

- [x] 4.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 4.2 浏览器实测：纸面三处删除都是淡色垃圾桶图标、点一下进确认态；版本卡片时间一行、操作一行
