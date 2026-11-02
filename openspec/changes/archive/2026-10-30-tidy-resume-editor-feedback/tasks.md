## 1. 结构检查归到一处

- [x] 1.1 `frontend/src/engines/structure.ts`: 新增 `findStructureFindings(draft)` 与 `structureIssueId(ruleId, anchor)`，把结构规则的判断、文案模板与按分区的字段措辞搬进来，每条结果同时给出 `problem`、`suggestion` 与纸面短标注 `label`
- [x] 1.2 `frontend/src/engines/diagnose.ts`: 结构类规则改为调用 `findStructureFindings`，保留严重度优先排序与意见 id 的构造方式，规则、严重度与文案一字不改

## 2. 结构问题就地标注

- [x] 2.1 `frontend/src/views/DraftView.vue`: 删掉顶部「这份简历还有结构问题」横幅与视图里重写的 `structuralIssues`，改用 `findStructureFindings` 的结果
- [x] 2.2 `frontend/src/views/DraftView.vue`: 分区标题与条目头旁渲染结构标注 chip，只在编辑模式出现，标注用无衬线字体与浅底色，点击定位到右侧对应的批注
- [x] 2.3 `frontend/src/components/ResumePreview.vue`: 打印样式里隐藏结构标注与行内批注

## 3. 纸面批注改成轻量行内形式

- [x] 3.1 `frontend/src/views/DraftView.vue`: 要点下方的批注改成一行摘要（条数 + 问题摘要），展开后每条批注各占一行，点击定位到右侧批注栏
- [x] 3.2 `frontend/src/views/DraftView.vue`: 删掉插在正文里的完整批注卡与相关样式

## 4. 批注顺序统一

- [x] 4.1 `frontend/src/stores/draft.ts`: 新增 `orderedIssues`，按简历位置排序
- [x] 4.2 `frontend/src/views/DraftView.vue`: 纸面映射与右侧批注栏都改用 `orderedIssues`
- [x] 4.3 `frontend/src/views/DiagnosisView.vue`: 删掉页面内的排序实现，改用 `orderedIssues`

## 5. 折叠态批注栏

- [x] 5.1 `frontend/src/components/CommentSidebar.vue`: 折叠时列出各严重程度的批注条数，选中某一档则展开并只显示该严重度

## 6. 页头收紧

- [x] 6.1 `frontend/src/views/DraftView.vue`: 页头按"状态 → 模式 → 操作"重新分层，副标题压成一行短句，「重新导入」降级为文字按钮

## 7. 清理失效代码

- [x] 7.1 `frontend/src/stores/ui.ts`: 删除 `showLowSeverity`、`restoreIgnoredIssues`、`clearFocusComment`、`activeSection`、`clear()`，`focus()` 简化为只设 `focusedBulletId`
- [x] 7.2 `frontend/src/views/DraftView.vue`、`frontend/src/views/DiagnosisView.vue`: 跟进 `focus()` 的签名变化

## 8. 验证

- [x] 8.1 `frontend/src/engines/structure.spec.ts`: 各条规则的命中与否、标注措辞按分区区分
- [x] 8.2 `frontend/src/engines/structure.spec.ts`: 断言诊断里的结构意见与 `findStructureFindings` 的规则、锚点、文案与严重度一致
- [x] 8.3 `frontend/src/views/DraftView.spec.ts`: 断言纸面有结构标注、没有横幅、纸面上没有完整批注卡、批注顺序等于简历顺序
- [x] 8.4 `frontend/src/stores/draft.spec.ts`: 断言 `orderedIssues` 按简历位置排序
- [x] 8.5 `frontend/src/components/ResumePreview.spec.ts`: 断言打印样式隐藏结构标注与行内批注
- [x] 8.6 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 8.7 浏览器实测：`npm run dev` 后在 1440×900 与 1200×900 下核对编辑页——顶部无横幅、纸面完整放开、标注贴在条目旁、行内批注是细线、折叠栏能看到严重度分布
