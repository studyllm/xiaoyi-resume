## 1. 生成中的等待提示

- [x] 1.1 `packages/shared/src/domain/states.ts`：两条状态（等模型 / 按规则引擎）
- [x] 1.2 `frontend/src/views/JdView.vue`：生成中在按钮上方显示状态；每秒计时；结束时清掉
- [x] 1.3 `frontend/src/views/JdView.spec.ts`：一条用例

## 2. 验证

- [x] 2.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 2.2 手工：勾上「本次用模型」生成 → 看到「正在等模型改写 / 已等待 N 秒」
- [x] 2.3 仓库根：`npm run verify` 全绿
