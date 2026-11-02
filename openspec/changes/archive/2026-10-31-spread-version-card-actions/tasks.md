## 1. 按钮在行内均分

- [x] 1.1 `frontend/src/views/VersionsView.vue`: 操作按钮行加 `justify-content: space-between`

## 2. 测试

- [x] 2.1 `frontend/src/views/VersionsView.spec.ts`: 断言操作按钮行均分

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：第一个按钮与生成时间左边界差值 0，最后一个按钮贴右，间隔一致
