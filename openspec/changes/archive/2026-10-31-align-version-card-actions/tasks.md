## 1. 操作按钮与生成时间左对齐

- [x] 1.1 `frontend/src/views/VersionsView.vue`: 操作按钮行把按钮自身的左右内边距归零，间距交给 flex 的 gap

## 2. 测试

- [x] 2.1 `frontend/src/views/VersionsView.spec.ts`: 断言操作按钮行归零了按钮内边距

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：时间左边界与第一个图标左边界差值 0，按钮间隔一致
