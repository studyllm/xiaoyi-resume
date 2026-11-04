## Why

P3 是唯一一个会**推翻数据 schema** 的阶段，F3、F5、F9 三条冻结点都在等一组决定：服务端用什么语言、跑什么、引擎放哪、鉴权长什么样。

这些决定不能边写边定。理由有三条：

- **F9（共享引擎）**：服务端语言必须能跑 TypeScript，否则 `domain/` + `engines/` 要复制成两份，引擎在两端漂移，「同一输入同一输出」只剩口头约定。这是唯一真正致命的一条。
- **F5（账号标识）**：`userId` 从客户端生成的 `user-${name}` 改为服务端签发的不可猜测标识，这条改动会贯穿数据模型、迁移规则与 API 契约。
- **T3.1（API 契约冻结）**是 P3 的第一个任务，**先于任何代码**。契约的类型来源、鉴权语义、错误码形状都取决于这组决定。

所以：先把决定写下来，再动代码。

## What Changes

- 新增 `docs/adr/0002-auth-model.md`：鉴权模型。邮箱 + 密码，argon2id 哈希，httpOnly cookie + 服务端 session 表，邮箱验证与找回密码，未验证账号不能登录但导入页保持匿名可用。**接邮件服务商**，默认阿里云邮件推送。
- 新增 `docs/adr/0004-engine-placement.md`：引擎放在服务端。`ResumeEngines` 五个方法在 `remote` 模式下由服务端执行，前端走 HTTP 调用；保留 mock 实现；共享包用 npm workspaces 保持同一份源码；`pdfText.ts` 留在前端。
- 新增 `docs/backend-stack.md`：技术栈总览——逐层选型与落选者、目录结构、数据模型、部署与运维、契约怎么写、本地怎么跑、明确不做的。
- 计划书的 P3 章节补上这组决定与工期变化（12 → 14 人日）。

**不改动任何能力域的 REQUIREMENT。** 退役类需求（`prototype-runtime` 的离线要求、`account-access` 的「无密码」要求）按冻结点 F10 的执行方式，以 **P3 首个实现变更**的 delta spec 形式提出，与实现一起归档——不提前并进 `openspec/specs/`，否则会出现「规格说已改成邮箱密码、代码还是一个名字」的打脸状态。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

（无——见上「不改动任何能力域的 REQUIREMENT」的理由。）

## Impact

- 新增文件：`docs/adr/0002-auth-model.md`、`docs/adr/0004-engine-placement.md`、`docs/backend-stack.md`。
- 改动文件：`docs/产品开发计划-v1.0.md`（P3 章节的决定与工期）。
- 不改代码。P3 的实现从 T3.1（API 契约冻结）开始，那时会开第一个实现变更并带上 F10 的退役 delta。
- 引入两个外部供应商依赖：**邮件服务商**（唯一直接接触 PII 的一个）与对象存储（备份）。两者的数据出境口径要写进 F8 的隐私结论。
