## 1. 库比代码旧时给出可操作的下一步

- [x] 1.1 `server/src/http/errors.ts`：加 `describeMissingSchema`——按 PG 错误码识别缺列/缺表
- [x] 1.2 `server/src/app.ts`：错误处理里把它补进日志消息
- [x] 1.3 `server/src/http/errors.spec.ts`：三条用例

## 2. 文档

- [x] 2.1 `docs/ops/runbook.md`：加一条「登录后所有接口都 500」的排查

## 3. 验证

- [x] 3.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 仓库根：`npm run verify` 全绿
