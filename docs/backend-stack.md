# 服务端技术栈

P3 服务端化的技术选型。**决策记录在 ADR 里，这份文档是总览与操作说明。**

| 决策 | 记录在哪 |
| --- | --- |
| 引擎放哪 | [`adr/0004-engine-placement.md`](adr/0004-engine-placement.md) |
| 鉴权模型 | [`adr/0002-auth-model.md`](adr/0002-auth-model.md) |
| 引擎模式开关 | [`adr/0001-engine-mode-switch.md`](adr/0001-engine-mode-switch.md) |

---

## 1. 选型

| 层 | 选型 | 为什么 | 谁出局 |
| --- | --- | --- | --- |
| 语言与运行时 | **TypeScript + Node 22** | 引擎是产品的核心逻辑，复制两份必然漂移（F9） | Python / Go / Rust：破 F9 |
| 包结构 | **npm workspaces** | 一份源码、一个 lockfile，共享包靠工具链保证不漂移 | 独立仓库：多一套发布与版本对齐 |
| HTTP 框架 | **Fastify + TypeBox** | schema-first，**契约可执行** | Express：校验与类型要自己拼；Nest：12 人日里学框架成本太高；Hono：edge-first，长驻容器 + Postgres + session 的插件生态不如 Fastify 成熟 |
| 数据库 | **PostgreSQL 16** | 事务（账号隔离、版本快照）+ JSONB 存简历树 | SQLite：并发写与后续扩展会咬人；把简历拆成关系表：树形硬拆更复杂 |
| 数据层 | **Drizzle ORM + SQL 迁移文件** | schema 就是 TS 文件，与共享包同语言；迁移能手工审 | Prisma：自带 DSL 与 Rust 引擎，镜像更大、迁移要另一套工具链 |
| 鉴权 | **自建会话**：httpOnly cookie + 服务端 session 表 + argon2id | 完全可控，隐私面小 | Auth.js / Lucia：要迁就框架抽象；BaaS 的 Auth：隐私面多一个供应商 |
| 密码哈希 | **argon2id** | 内存硬、抗 GPU | bcrypt：内存硬参数受限 |
| 邮件 | **阿里云邮件推送**（备选 Resend） | 送达率到 163 / QQ / 126 | 见 ADR-0002 第 6 节 |
| 观测 | **pino** 结构化日志 + 请求 id | T3.9，且**不含简历正文** | — |
| 错误上报 | **Sentry**（服务端 SDK） | 异常带上下文 | — |
| 部署 | **单容器 + 单实例 Postgres**（Docker Compose） | 计划 §7.5 的假设：不引入 K8s 与多副本 | — |

---

## 2. 为什么语言这一条是硬的

三条约束几乎把选择空间锁死了：

**F9（共享引擎）是唯一致命的一条。** `domain/` + `engines/` 必须是同一份源码，前端与服务端引用同一份。引擎就是产品的核心逻辑——诊断规则、措辞变换、「不编造」的不变量校验。复制成两份，漂移只是时间问题，而漂移的代价是核心承诺失效。

引擎现在就在浏览器里跑且无 DOM 依赖，所以**服务端必须能跑 TypeScript**。这条直接否掉 Python（FastAPI 的 LLM 生态再好）、Go、Rust。

**ADR-0004 已经把服务端形态定了：它不是纯存储 API，是引擎宿主。** 因此服务端需要能跑长请求（生成版本在规则引擎下是毫秒级，P4 接模型后是十秒级），也需要能拿到用户数据算覆盖——两者都指向长驻进程，不是函数。

**「后端由前端工程师兼任」（计划 §7.5），P3 共 14 人日。** 语言统一省掉一次跨语言调试；熟悉度直接决定这 14 人日够不够。

---

## 3. 目录结构

```
frontend/                 前端应用（**留在根目录，不搬**）
  src/pdf/                浏览器专属：pdf.js 提取 PDF 文字层
server/                   Node 服务（P3 起）
  src/routes/             路由与 TypeBox schema（契约在这里）
  src/db/                 Drizzle schema 与迁移
  src/auth/               会话、密码、邮件
  src/engines/            ResumeEngines 的远端实现（包一层 HTTP）

packages/shared/          npm workspace，包名 @xiaoyi/shared
  src/domain/             types / time / ids / sectionFields / states / breakpoints
  src/engines/            parseDraft / diagnose / jd / generateVersion / …
  src/contracts/          错误码表与请求响应 schema

docs/api-contract.md      契约的**说明**（代码才是契约本身）
```

**`frontend/` 留在根目录。** 搬目录会让 CLAUDE.md、CI 工作流、README 与每一个 import 路径失效，纯粹的无谓返工，而且会和每一个在开的 PR 撞车。

**共享包用包名解析，不用路径别名。** `@xiaoyi/shared/domain/types` 由 npm workspace 解析——包边界**由解析器强制**：服务端引用不到前端的东西，前端也引用不到服务端的。走别名的话那只是约定，约定会被绕过。

**依赖装在仓库根**（npm workspace 会提升），lockfile 也在根目录，`frontend/node_modules` 不存在。

`pdfText.ts` 留在前端——PDF 提取是浏览器能力，且 P1 承诺过文件不上传。

---

## 4. 契约：写代码，不写散文

`docs/api-contract.md`（计划 D1）**不是**手写的文档，而是 TypeBox schema 的说明。

```ts
// apps/server/src/routes/resume.ts
export const saveResume = {
  body: Type.Object({ text: Type.String({ minLength: 1 }) }),
  response: Type.Object({
    draft: DraftSchema,
    revision: Type.Integer(),
  }),
}
```

前后端从**同一份 schema** 取类型。好处有三层：

1. **契约漂移在编译期暴露**，不是上线后暴露。
2. 计划 A3.1 的「契约测试」不需要额外写——schema 本身就是断言。
3. 错误码与用户文案的映射（F7）能从 schema 生成，`docs/error-taxonomy.md` 的状态表与服务端的错误码一一对应。

---

## 5. 数据模型

| 表 | 内容 | 备注 |
| --- | --- | --- |
| `users` | `id`（UUID）、`email`（规范化）、`email_verified_at`、`password_hash` | `id` 不可猜测、不含邮箱（F5） |
| `sessions` | `id`、`user_id`、`expires_at` | 登出全清靠它 |
| `verification_tokens` | `user_id`、`kind`（验证 / 重置）、`token_hash`、`expires_at` | **只存哈希** |
| `drafts` | `user_id`（唯一）、`payload`（JSONB）、`revision` | 一账号一份底稿 |
| `versions` | `id`、`user_id`、`payload`（JSONB）、`created_at` | 版本快照，不可变 |
| `generations` | `user_id`、`engine`、`model`、`prompt_version`、`draft_revision`、`jd_hash`、`status`、`prompt_tokens`、`completion_tokens`、`claims`、`reverted`、`raw_output`、`error` | 生成日志。**输入用引用，不复制简历正文**（ADR-0005 §5） |

简历与版本存 JSONB，不拆关系表——它们是树形结构，硬拆成表比 JSONB 更复杂。**账号隔离靠外键与查询条件，不靠前端**（计划 A3.2 要求后端断言）。

schema 版本号与迁移链沿用 `stores/persistence.ts` 现成的「版本号 + 迁移链 + 迁移失败不白屏」范式（计划 T3.3，**有先例，勿另造一套**）。

---

## 6. 部署与运维

**全部自管**（用户决定）：一台 VPS + Docker Compose，应用容器与 Postgres 容器同机。

### 6.0 本地环境

`docker-compose.yml` 起一个 Postgres（单实例，与生产的假设一致）：

```bash
npm run db:up          # 起 Postgres（127.0.0.1:5432）
npm run db:migrate     # 跑迁移 SQL
npm run dev:server     # 服务端（读 DATABASE_URL 等环境变量）
```

服务端的环境变量清单在 `server/.env.example`。**镜像仓库拉不动时**用 `npm --workspace server run dev:embedded`：内嵌的 Postgres + 内存发信器，免 Docker。

`docker-compose.yml` 里还有一个可选的 Mailpit（`--profile mail`）收验证邮件，本地不用真发信。

**测试不需要 Postgres。** `server/src/db/postgres.spec.ts` 用 `embedded-postgres`
在临时目录里起一个**真 Postgres**（二进制随 npm 装，平台包自动解析），
对着它跑迁移 SQL 与全部存储用例。这样 CI 不需要起服务容器，
「schema 与迁移 SQL 对不对」这件事也不会只靠接口层的语义测试。

### 6.1 备份

| 项 | 定法 |
| --- | --- |
| 频率 | 每晚 `pg_dump` |
| 去向 | **离机**——加密后传到 S3 兼容对象存储（阿里云 OSS / 腾讯云 COS / Backblaze B2） |
| 保留 | 日备 7 份 + 周备 4 份 |
| **演练** | **每月把备份恢复到临时容器跑一遍校验**——没演练过的备份不算备份 |
| 加密 | 备份文件静态加密，密钥与备份分开存放 |

同机备份等于没备份——机器坏了备份跟着一起坏。

### 6.2 监控

不上 Prometheus。一台机器撑不起那套东西，还多一个要维护的组件。

| 项 | 做法 |
| --- | --- |
| 存活 | 应用暴露 `/healthz`；外部 uptime 监控（Uptime Kuma 自托管，或 healthchecks.io 定时 ping） |
| 异常 | Sentry 服务端 SDK |
| 数据库 | 每日巡检 SQL（连接数、慢查询、磁盘余量、备份是否成功）→ 邮件告警 |
| 证书 | 域名证书自动续期，到期前 14 天告警 |

### 6.3 升级

Postgres **季度一次**，读 release note 再上，不追最新版。

### 6.4 数据泄露剧本

计划 D9（`docs/ops/runbook.md`）的一部分，P5 写全。骨架：

1. 轮换数据库密码与全部密钥。
2. 查审计日志确认泄露范围（**日志不含简历正文**，所以能查清访问了哪些记录，但查不到内容）。
3. 按监管要求通知受影响用户。
4. 从备份恢复，或按用户请求删除其数据。

---

## 7. 本地怎么跑

```bash
docker compose up -d postgres      # 本地数据库
npm run dev                        # 前端（mock 模式，默认）
npm run dev:server                 # 服务端（remote 模式）
```

前端默认走 `mock`（ADR-0001：未知值静默回落）。要连服务端时设 `VITE_ENGINE_MODE=remote`。

CI 三侧全绿（计划 A3.5）：前端 `npm run verify`、服务端 `npm run test`、共享包 `npm run test`。

---

## 8. 明确不做的

| 不做 | 为什么 |
| --- | --- |
| K8s、多副本 | 计划 §7.5 的假设；单实例足够 |
| 微服务拆分 | 一个人 14 人日，微服务只会把接口变多 |
| GraphQL | REST + TypeBox schema 已经够；契约的收益来自 schema，不来自 GraphQL |
| Redis / 消息队列 | 单实例没有并发压力；P4 接模型后如果生成要排队，再引入 |
| 服务端渲染 | 产品是纯前端 SPA，SSR 解决不了这里的任何问题 |
| 第三方登录、短信、多因素 | ADR-0002 第 7 节 |
| 审计日志单独一套 | 先用 Postgres 的表记，规模上来再抽 |

---

## 9. 工期

**14 人日**（12 + 邮箱验证与找回密码的 2）。分配：

| 项 | 人日 |
| --- | --- |
| API 契约冻结 + 服务端骨架 | 2 |
| 鉴权（注册、验证、登录、登出全清、找回密码、发信） | 4 |
| 共享包抽取 + 引擎异步化 | 2 |
| 数据模型、迁移与存储 | 3 |
| 前端接入（会话、路由守卫、离线降级、存量迁移） | 2 |
| 部署、备份、监控、可观测 | 1 |

「后端由前端工程师兼任」是这条估算的前提。专职后端可以压到约 10。
