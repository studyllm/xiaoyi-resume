## 1. 批注条不再溢出，要点的删除入口回到正文那一行

- [x] 1.1 `frontend/src/components/resume-editor.css`: 批注条宽度扣掉自己的左缩进（`width: calc(100% - 14px)`），「展开 / 收起」回到块内
- [x] 1.2 `frontend/src/components/resume-editor.css`: 批注条左内边距调成 10px，与展开后的批注文字对齐
- [x] 1.3 `frontend/src/components/ResumePreview.vue`: 要点行里「删除入口」排到「行内批注」之前，删除入口留在正文那一行

## 2. 测试

- [x] 2.1 `frontend/src/components/ResumeEditor.spec.ts`: 断言批注条不超出所在要点行，删除入口与要点正文在同一行

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：收起与展开两种状态下，「展开 / 收起」都在块内，删除入口在正文那一行，两行文字左边对齐
