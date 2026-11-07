## Why

T3.2（鉴权）是 P3 的第一个实现任务，但它有三块地基，缺一块就写不成：

- **数据模型**：账号、会话、验证令牌三张表。没有它们，鉴权端点无从落地。
- **错误码表**：契约 §5 已经冻结了 19 个错误码，但它们只是文档。前端要按码取文案，服务端要按码生成响应——**得有一份两侧共用的代码**，否则「错误码归服务端、文案归前端」的口径落不了地。
- **状态表**：那十个带错误码的状态还没有。守卫要断言「错误码表 ↔ 状态表一一对应」，两边得同时到位。

另外，本地没有可用的 Postgres（Docker 守护进程没起），所以数据层按 `stores/persistence.ts` 的先例做成**接口 + 内存实现 + Postgres 实现**：接口是设计，内存实现让语义可测。

## What Changes

- **共享包**新增 `contracts/error-codes.ts`：19 个错误码 → HTTP 状态 + 前端状态条目。两侧的唯一来源。
- **状态表**：`StateCopy` 加 `code` 字段；补上十个带码的新状态；导出 `ALL_STATES`。
- **守卫**：`flows.spec.ts` 断言错误码表与状态表**一一对应**（码不存在、状态不存在、码被用两次、表里有码没人用——四种都抓）。
- **服务端数据层**：`db/schema.ts`（Drizzle 表定义）、`db/store.ts`（`AccountStore` 接口 + 内存实现 + Postgres 实现 + 密码哈希 + 令牌哈希）、`db/migrate.ts`（版本号 + 迁移链 + **失败不白屏**）。
- **schema 迁移**：`db/migrations/` 下的 SQL 文件，进版本库能手工审。
- **退役 delta**（冻结点 F10）：`account-access` 整域重写（邮箱 + 密码 + 验证，退役「只询问一个名字、SHALL NOT 要求密码」）；`prototype-runtime` 退役「原型不依赖后端」。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

- `account-access`: 整域重写——登录要密码与邮箱验证，账号标识由服务端签发，退役「无密码」要求。
- `prototype-runtime`: 退役「原型不依赖后端」。

## Impact

- 新增文件：`packages/shared/src/contracts/error-codes.ts`、`server/src/db/{schema,store,migrate}.ts`、`server/src/db/store.spec.ts`、`server/src/db/migrations/`。
- 改动文件：`packages/shared/src/domain/states.ts`、`frontend/src/flows.spec.ts`、`server/package.json`、`package-lock.json`。
- 新增依赖：`drizzle-orm`、`pg`（运行时）、`drizzle-kit`（开发）。
- **本变更不归档**：退役 delta 描述的是「邮箱 + 密码」的完整语义，而前端的登录界面与会话接入还没做（F10：与该阶段实现一起归档）。前端接入完成、行为与规格一致了再归档。
- 鉴权端点（注册/验证/登录/登出/找回密码）本轮**还没写**——它们依赖前端接入时一起定的会话 cookie 与错误提示流程。下一轮补。
