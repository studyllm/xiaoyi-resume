## 1. 失败原因带上服务商说的

- [x] 1.1 `server/src/llm/client.ts`：错误消息带上服务商的说明（优先 `error.message`，否则正文，截到 300 字）
- [x] 1.2 `server/src/llm/client.spec.ts`：两条用例

## 2. 验证

- [x] 2.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 2.2 手工：用配好的模型跑一次生成 → 生成日志里是「模型返回 402：insufficient balance (1008)」
- [x] 2.3 仓库根：`npm run verify` 全绿
