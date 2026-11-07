## Why

共享包抽出来了，但还没有第二个消费者——**F9 的保证还没闭合**。「前后端引用同一份源码」目前只是结构上的可能，没有被证明过。

`server/` 起来之后，这个保证才能变成一条可执行的断言：服务端跑共享引擎得到的输出，与直接调用共享包逐字相同。哪天有人把引擎复制了一份到服务端，或者让服务端走了另一套实现，这条断言立刻红。

而且契约（`docs/api-contract.md`）已经冻结，端点却一个都没有——契约与实现之间现在隔着整个服务端。

## What Changes

- 新增 `server/` workspace（npm workspace `@xiaoyi/server`）：Fastify + `tsx`，`npm run verify` 跑类型检查与用例。
- 两个端点：`GET /api/v1/healthz`、`POST /api/v1/draft/parse`（**公开端点**，跑共享包的 `parseDraft`）。
- **F9 的可执行断言**：服务端用例断言 HTTP 端点的输出与直接调用共享引擎逐字一致。
- 仓库根的 `npm run verify` 跑两端；CI 增加服务端门禁（A3.5「前端、后端、CI 三侧全绿」）。
- `CLAUDE.md` 与计划书的 T3.4 / F9 状态更新。

**不改动任何能力域的 REQUIREMENT。** `server-api` 能力域随鉴权与存储一起提（F10 的执行方式）。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

（无。）

## Impact

- 新增文件：`server/package.json`、`server/tsconfig.json`、`server/src/{app,index}.ts`、`server/src/routes/{healthz,parse}.ts`、`server/src/app.spec.ts`。
- 改动文件：根 `package.json`（workspaces 与 verify）、`package-lock.json`、`.github/workflows/ci.yml`、`CLAUDE.md`、`docs/产品开发计划-v1.0.md`。
- 新增依赖：`fastify`（运行时）、`tsx` / `typescript` / `vitest`（开发）。
- **端点实现是契约的一个子集**：契约里的 21 个端点目前实现了 2 个，其余随 T3.2 起逐个落地。
- 错误码目前是路由里的字面量（`RESUME_EMPTY`、`PARSE_FAILED`）；**契约 §5 的错误码表随 T3.2 落地**，届时服务端由表生成，不再写字面量。
