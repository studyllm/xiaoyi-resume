## Context

库比代码旧时，查询报 `undefined_column`（PG 错误码 `42703`）或 `undefined_table`（`42P01`）。Drizzle 把原始的 PG 错误放在 `cause` 上，自己的消息只有「Failed query: … params: …」。

## Goals / Non-Goals

**Goals:**

- 开发者看日志就知道「跑迁移」。

**Non-Goals:**

- 不自动跑迁移——服务端不碰用户的库。
- 不把技术细节给终端用户。
- 不在启动时检查迁移状态（那要算迁移文件的 hash，脆）。

## Decisions

### D1. 按 PG 错误码识别

`42703 undefined_column` 与 `42P01 undefined_table` 是这两类问题的准确标记 ✓ —— 比匹配错误消息文本可靠 ✓（消息里可能有列名、库名 ✓）。

### D2. 提示只进日志

响应体仍是 `500 INTERNAL_ERROR` ✓ —— 「数据库版本比代码旧」是给开发者的 ✓，终端用户看到「出了点问题，刷新一下再试」✓ 合适 ✓。

### D3. 不自动跑迁移

服务端替用户改库结构是越权 ✓。迁移是开发/部署流程的一步 ✓（README 与 runbook 都写了 ✓）。

## 验证方式

- `server/src/http/errors.spec.ts`：列不存在、表不存在都给提示；别的错误不乱套 ✓
- 手工：把库退回旧版本 → 接口 500 → 日志里出现「请跑 npm run db:migrate」✓
- 仓库根 `npm run verify` 全绿 ✓
