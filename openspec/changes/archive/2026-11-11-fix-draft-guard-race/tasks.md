## 1. 守卫等草稿加载完

- [x] 1.1 `frontend/src/stores/draft.ts`：暴露 `whenRestored()`——等当前这次重载结束
- [x] 1.2 `frontend/src/router/index.ts`：判断有没有底稿之前先 `await draftStore.whenRestored()`
- [x] 1.3 `frontend/src/router/index.spec.ts`：草稿延迟返回时路由停在 /jd

## 2. 验证

- [x] 2.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 2.2 手工：刷新 /jd → 停在 JD 页（修复前被送回导入页）
- [x] 2.3 仓库根：`npm run verify` 全绿
