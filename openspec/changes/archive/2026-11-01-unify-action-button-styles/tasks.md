## 1. 页面动作区的按钮统一 small

- [x] 1.1 `frontend/src/views/DiagnosisView.vue`: 页头「开始诊断 / 重新诊断」「清空诊断结果」加 `size="small"`
- [x] 1.2 `frontend/src/views/VersionsView.vue`: 页头「打开我的简历 / 导入简历」加 `size="small"`
- [x] 1.3 `frontend/src/views/VersionDetailView.vue`: 页头「导出 PDF」加 `size="small"`
- [x] 1.4 `frontend/src/views/ImportView.vue`: 解析结果区页头的「保存」加 `size="small"`
- [x] 1.5 `frontend/src/views/JdView.vue`: 底部「生成版本」加 `size="small"`
- [x] 1.6 `frontend/src/views/DraftView.vue`: 页头已是 small，不动
- [x] 1.7 `frontend/src/views/DiagnosisView.vue`: 过期告警条里的「重新诊断」改成 `text size="small"`——页头已经有同一个动作的实心主色按钮，同一个动作不出现两次实心主色
- [x] 1.8 `frontend/src/views/ImportView.vue`: 表单动作区的「解析」「载入演示数据」加 `size="small"`——表单里的那排操作也是页面动作区，和结果区页头的「保存」同尺寸

## 2. 次要动作改成文字按钮

- [x] 2.1 `frontend/src/views/VersionDetailView.vue`: 「复制」改成 `text size="small"`，保留图标；「返回列表」改成 `text size="small"`
- [x] 2.2 `frontend/src/views/JdView.vue`: 「解析 JD」「载入示例：xxx」改成 `text size="small"`；「查看已有版本」改成 `text size="small"`
- [x] 2.3 `frontend/src/views/VersionPrintView.vue`: 「返回」改成 `text size="small"`
- [x] 2.4 `frontend/src/components/CommentSidebar.vue`: 空状态引导按钮由 `type="primary"` 改成 `text`，尺寸仍为 small
- [x] 2.5 `frontend/src/components/CommentSidebar.vue`: 零意见空状态里的「重新诊断」补上 `text`，不留带边框的次要动作

## 3. 卡片内的行内动作补齐图标

- [x] 3.1 `frontend/src/components/DiagnosisComment.vue`: 「忽略此条」补一个忽略图标，跟「去修改」「标记已处理」一致

## 4. 守卫测试

- [x] 4.1 `frontend/src/flows.spec.ts`: 新增——`.page-actions` 块内的 `el-button` 都带 `size="small"`
- [x] 4.2 `frontend/src/flows.spec.ts`: 新增——每个 `.vue` 文件里的实心主色按钮至多一个，导入页白名单
- [x] 4.3 `frontend/src/flows.spec.ts`: 新增——版本卡片与批注卡片里的行内按钮都带 `:icon`
- [x] 4.4 `frontend/src/flows.spec.ts`: 动作区的范围扩到 `.import-actions`（表单里的那排操作）；导入页动作区允许两个实心主色，作为规格写明的例外

## 5. 验证

- [x] 5.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 5.2 浏览器实测：诊断页页头两个按钮同为 small 且一个是绿底一个纯文字；编辑页「保存」「放弃修改」「重新导入」同为 small；版本详情页「导出 PDF」绿底、「复制」「返回列表」纯文字；批注卡片三个动作都带图标；导入页解析后「解析」「保存」都是绿底
