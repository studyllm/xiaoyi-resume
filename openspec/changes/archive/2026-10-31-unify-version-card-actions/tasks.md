## 1. 按钮形态与对齐

- [x] 1.1 `frontend/src/views/VersionsView.vue`: 「打开」补上眼睛图标，四个操作按钮形态一致
- [x] 1.2 `frontend/src/styles/main.css`: 删除按钮不再单独收窄内边距，与同排按钮对齐

## 2. 测试

- [x] 2.1 `frontend/src/views/VersionsView.spec.ts`: 卡片上的四个操作按钮都带图标

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：四个图标左偏移与上边界一致
