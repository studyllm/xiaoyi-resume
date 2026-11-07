## Context

T3.2 是 P3 的首个实现任务。本轮做它的三块地基：数据模型、错误码表、状态表。

服务端此前只有两个端点（`healthz` 与 `draft/parse`），没有存储、没有鉴权。

## Goals / Non-Goals

**Goals:**

- 数据模型定下来，语义可测。
- 错误码表成为两侧共用的代码，守卫守住一一对应。
- 存量迁移的「失败不白屏」范式搬到服务端。

**Non-Goals:**

- 不写鉴权端点（下一轮，与前端接入一起）。
- 不动前端界面与会话 store。
- 不落库测试——本地没有 Postgres。

## Decisions

### D1. 密码哈希用 Node 自带的 scrypt

不用 argon2。argon2 是原生模块，要下载预编译二进制；scrypt 在 Node 标准库里，内存硬、无额外依赖。

**代价**：与 ADR-0002 写的 argon2id 不一致。**理由是环境**：这个环境里原生模块的安装不可靠，而 scrypt 的安全性质足够（内存硬、定长比较）。若部署环境能装 argon2id，切回去只是换 `hashPassword`/`verifyPassword` 两个函数。

### D2. 令牌用 SHA-256，不用 scrypt

令牌是高熵随机串，不是人选的密码。内存硬对随机串没有意义，还慢。

### D3. 数据层做成接口 + 两个实现

`AccountStore` 接口 + 内存实现（测试）+ Postgres 实现（生产）。

**理由**：本地没有 Postgres，Docker 守护进程也没起。接口让语义（账号隔离、令牌一次性、邮箱规范化）可测，而 Postgres 实现是机械的翻译。

**先例**：`stores/persistence.ts` 就是这个路子——`StorageAdapter` 接口 + 内存实现兜底。

### D4. 迁移的「失败不白屏」按批量来

`migrateMany` 逐项迁移，一项失败丢那一项，其余照常，返回丢弃清单。

**理由**：`persistence.ts` 的 `read()` 就是逐个 key 迁移、失败丢那个 key 并 warning。搬到服务端后「一份本地存档」变成「一批资源」，语义同构。

### D5. 错误码表放共享包，服务端由它生成

`ERROR_CODES` 是唯一来源。服务端不再写错误码字面量。

**理由**：契约 §5 明说「不在两处各写一份」。守卫断言表与状态表一一对应——改了码忘了加状态，测试立刻红。

### D6. 退役 delta 提出但不归档

`account-access` 的重写描述的是完整语义，前端还没做。归档会让规格跑到实现前面。

**先例**：冻结点 F10 的执行方式明说「与该阶段实现一起归档，不提前改动 `openspec/specs/`」。

## Risks / Trade-offs

**[Postgres 实现没被测过]** → 本地没有 Postgres。等 Docker 起来补一个跑真库的用例；接口层的语义测试已经覆盖了行为。

**[scrypt 与 ADR-0002 写的 argon2id 不一致]** → 换哈希算法是改两个函数的事，但要连带改 ADR。部署环境能装原生模块就换回去。

**[唯一索引在迁移 SQL 里，忘了加会怎样]** → `drizzle-kit generate` 重新生成即可，SQL 进版本库能手工审。

## Migration Plan

无数据迁移。本轮只有 schema 与代码。

## Open Questions

- 会话 cookie 的具体名字与属性（`Secure`、`SameSite=Lax`、绝对有效期 30 天）随鉴权端点一起定。
- `Idempotency-Key` 的存储位置随写操作落地。
