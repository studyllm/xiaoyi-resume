# API 契约（v1）

> **这是冻结的契约。** 前后端与测试都以这份为准。契约漂移是服务端化最贵的返工源——所以它先于任何代码写定。
>
> **可执行形式**：契约的请求、响应与错误码最终落成 TypeBox schema，放在 `packages/shared/contracts/`，前端与服务端引用同一份。`docs/api-contract.md` 是它的**说明**，schema 是它本身。本文档先冻结内容，schema 随服务端落地（见 §11）。

- **落地状态**：21 个端点里**已实现 2 个**（`GET /api/v1/healthz`、`POST /api/v1/draft/parse`），其余随 P3 的后续任务逐个落地。已实现的端点由服务端用例断言与契约一致。
- **版本**：`/api/v1`
- **冻结时点**：P3 的第一个任务（T3.1），先于任何服务端代码
- **相关文档**：`docs/adr/0002-auth-model.md`（鉴权）、`docs/adr/0004-engine-placement.md`（引擎位置）、`docs/adr/0005-llm-access-shape.md`（模型接入）、`docs/privacy-conclusions.md`（数据口径）、`docs/error-taxonomy.md`（状态与文案）

---

## 1. 五条原则

1. **错误码由服务端给，文案由前端映射。** 后端只返回机器可读的 `code`，不产出用户可见文案——文案只有一处来源：`frontend/src/domain/states.ts`。后端返回 `message` 只作为兜底（服务端日志与调试用），前端**不直接展示它**。
2. **客户端不提交可信的结构化简历。** 保存时服务端重跑结构检查与不变量校验（ADR-0003 的「服务端是权威」）。
3. **`/api/v1` 前缀，只加不减。** 字段只能新增，枚举值只能新增；删字段或改语义要等下一个大版本。
4. **写操作要么幂等，要么带 `Idempotency-Key`。** 见 §6。
5. **所有时间由服务端给。** 客户端不传时间戳（引擎的 `EngineContext.now` 由服务端注入，ADR-0004）。

---

## 2. 通用约定

### 2.1 请求

| 项 | 约定 |
| --- | --- |
| 编码 | UTF-8 JSON，`Content-Type: application/json` |
| 字段命名 | `camelCase` |
| 日期 | `YYYY-MM`（年月）与 ISO 8601（时刻）。**简历里的年月不要带日** |
| 布尔 | `true` / `false`，不用 `0` / `1` |
| 空值 | 缺省字段**省略**；显式清空用 `null`（如 `end: null` 表示「至今」） |

### 2.2 响应

成功：直接返回资源对象，不包一层 `data`。

```json
{ "id": "ver_01", "name": "美团 前端工程师", "revision": 3 }
```

列表：

```json
{ "items": [...], "page": 1, "pageSize": 20, "total": 47 }
```

失败：

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "登录状态已失效，请重新登录。",
    "field": "email"
  }
}
```

| 字段 | 必有 | 说明 |
| --- | --- | --- |
| `code` | ✓ | 机器可读，**前端按它映射文案**。见 §5 |
| `message` | ✓ | 兜底文案。前端优先用自己的状态表，`message` 只在前端没登记该 `code` 时用 |
| `field` | ✗ | 仅校验类错误有，指出哪个字段不对 |

### 2.3 请求头

| 头 | 什么时候 | 说明 |
| --- | --- | --- |
| `Cookie: session=…` | 需要登录态的端点 | httpOnly 会话 cookie，`SameSite=Lax`、`Secure` |
| `Origin` | 所有非 GET | 服务端校验它与自身同源，挡 CSRF |
| `Idempotency-Key` | 需要的 POST | 见 §6 |
| `X-Request-Id` | 可选 | 客户端带的追踪 id；没带就由服务端生成，回在响应头里 |

### 2.4 响应头

| 头 | 说明 |
| --- | --- |
| `X-Request-Id` | 本次请求的追踪 id，出错时出现在用户可见的提示里，让客服能定位 |
| `Retry-After` | 只在 `429` 与 `503` 时给 |

---

## 3. 资源清单

「鉴权」列：**公开** = 不用登录；**登录** = 需要有效会话。

| 方法与路径 | 鉴权 | 幂等 | 说明 |
| --- | --- | --- | --- |
| `GET /api/v1/me` | 登录 | 是 | 当前账号 |
| `POST /api/v1/auth/register` | 公开 | 否（带 `Idempotency-Key`） | 注册并发验证邮件 |
| `POST /api/v1/auth/verify-email` | 公开 | 是 | 用邮件里的令牌激活账号 |
| `POST /api/v1/auth/login` | 公开 | 否（带 `Idempotency-Key`） | 登录 |
| `POST /api/v1/auth/logout` | 登录 | 是 | 登出当前会话 |
| `POST /api/v1/auth/logout-all` | 登录 | 是 | 登出**全部**会话 |
| `POST /api/v1/auth/password-reset` | 公开 | 否（限流） | 发重置邮件 |
| `POST /api/v1/auth/password-reset/confirm` | 公开 | 是 | 用令牌设新密码，吊销全部会话 |
| `PUT /api/v1/draft` | 登录 | 是 | 保存简历底稿（一份） |
| `GET /api/v1/draft` | 登录 | 是 | 读简历底稿 |
| `POST /api/v1/draft/parse` | **公开** | 否 | 解析简历正文（不落库）。**匿名可用**——导入页允许未登录的人粘贴、解析、在纸上修改（ADR-0002 §2） |
| `POST /api/v1/draft/import-local` | 登录 | 否（带 `Idempotency-Key`） | 迁移本地存量数据 |
| `POST /api/v1/diagnosis` | 登录 | 否 | 对已保存的底稿跑诊断 |
| `DELETE /api/v1/diagnosis` | 登录 | 是 | 清空诊断结果 |
| `POST /api/v1/jd/analyze` | 登录 | 否 | 解析 JD 并算覆盖 |
| `GET /api/v1/versions` | 登录 | 是 | 版本列表（分页） |
| `POST /api/v1/versions` | 登录 | 否（带 `Idempotency-Key`） | 生成版本 |
| `GET /api/v1/versions/:id` | 登录 | 是 | 版本详情 |
| `DELETE /api/v1/versions/:id` | 登录 | 是 | 删版本 |
| `GET /api/v1/versions/:id/body` | 登录 | 是 | 版本正文（`format=text\|markdown`） |
| `GET /api/v1/healthz` | 公开 | 是 | 健康检查 |

**没有上传端点。** PDF 在浏览器里解析完，只把**提取出的文本**发给服务端——这是 P1 对用户的承诺（「文件在浏览器里解析，不会上传到任何服务器」），服务端因此不需要文件相关的端点与错误码。

---

## 4. 端点细则

### 4.1 鉴权

```http
POST /api/v1/auth/register
{ "email": "someone@example.com", "password": "…" }
→ 201 { "email": "someone@example.com", "verificationRequired": true }
```

**注意**：注册成功后**不建立会话**——邮箱没验证前不能登录（ADR-0002 §2）。`verificationRequired: true` 让前端知道下一步是「去查收邮件」而不是「已登录」。

```http
POST /api/v1/auth/verify-email
{ "token": "…" }
→ 204
```

令牌 24 小时有效、一次性、只存哈希。验证成功后建立会话（省一次登录）。

```http
POST /api/v1/auth/login
{ "email": "…", "password": "…" }
→ 200 { "user": { "id": "usr_…", "email": "…" } }
```

**邮箱没验证时返回 `403 EMAIL_NOT_VERIFIED`**，不返回笼统的 403——前端要据此提示「去查收验证邮件」并给「重发」入口。

```http
POST /api/v1/auth/logout-all
→ 204
```

「登出全清」用独立端点，而不是 `logout` 带参数——破坏性范围不同的两个动作不该挤在一个端点里。

**登录失败不区分「邮箱不存在」与「密码不对」**，一律 `401 INVALID_CREDENTIALS`；找回密码同理（ADR-0002 §3）。

### 4.2 底稿

```http
PUT /api/v1/draft
{ "profile": {…}, "sections": [ { "kind": "experience", "title": "工作经历", "items": [ … ] } ] }
→ 200 { "revision": 4, "savedAt": "2026-11-07T…" }
```

- 整体替换语义（PUT），不是增量。
- 服务端**重跑**结构检查与不变量校验；有结构问题时**仍然保存**，但响应里带上问题清单——用户可以先存下来再慢慢改。
- `revision` 每次 +1。客户端带 `If-Match: <revision>` 做乐观并发：版本不匹配返回 `409 DRAFT_REVISION_CONFLICT`，前端提示「简历在别处被改过」。

```http
POST /api/v1/draft/parse
{ "text": "张三\n前端工程师\n…" }
→ 200 { "draft": {…}, "confidence": 0.9, "warnings": [...], "otherHeaders": [...] }
```

**纯计算，不落库。** 解析结果返回给客户端供纸面编辑；用户点保存时才 `PUT` 上去，服务端在保存时校验。这样服务端不留「取消导入」的残留。

### 4.3 诊断

```http
POST /api/v1/diagnosis
→ 200 { "state": "result", "issues": [ { "id": "iss_…", "severity": "high", "category": "…", "problem": "…", "suggestion": "…", "bulletId": "…" } ], "draftRevision": 4 }
```

- 无请求体：**诊断跑在已保存的底稿上**。诊断页看的就是保存后的那份（`CLAUDE.md` §5.2）。
- `state` 三态：`none`（没诊断过）/ `empty`（诊断了但零意见）/ `result`（有意见）。**与前端的三态一一对应**——前端的空状态分支直接由它决定（`resume-comment-anchoring` 规格）。
- `draftRevision` 用于「底稿更新后诊断结果失效」：底稿修订号变了，`state` 回到 `none`。

### 4.4 JD 与版本生成

```http
POST /api/v1/jd/analyze
{ "jdText": "…" }
→ 200 { "roleName": "前端工程师", "roleNameSource": "extracted", "warnings": [], "coverage": [ { "text": "…", "tier": "strong", "keywords": ["Vue"], "approximate": false } ] }
```

解析与覆盖算在一次调用里——前端不需要先拿 JD 再算覆盖，多一次往返没有意义。

```http
POST /api/v1/versions
{
  "jdText": "…",
  "name": "美团 前端工程师",
  "options": { "allowVerbFronting": true, "dropIrrelevantProjects": true, "useLlm": false }
}
→ 201 { "version": { "id": "ver_…", "name": "…", "integrity": { "checked": 42, "violations": [], "generator": "rules", "reverted": 0 }, "uncovered": [ … ] } }
```

- `options.useLlm`：**一次性开关**（`docs/privacy-conclusions.md` §5.1）。`false` 时全程走规则引擎，**简历正文不发给任何第三方**。
- 响应里的 `integrity` 用 ADR-0003 的新形状（`generator` / `reverted` / `violations[].kind`）。
- 生成可能耗时（P4 接模型后十秒级），客户端超时设 **30 秒**，超时后按「离线/超时」降级提示，**不重复提交**（靠 `Idempotency-Key`）。

```http
GET /api/v1/versions?page=1&pageSize=20
→ 200 { "items": [ { "id": "ver_…", "name": "…", "jdRoleName": "…", "draftRevision": 4, "createdAt": "…" } ], "page": 1, "pageSize": 20, "total": 47 }
```

列表项是**完整版本**。一份简历的版本通常只有几十个，一并返回省掉前端逐个拉详情；`pageSize` 上限 100，最坏情况也就几百 KB。`GET /api/v1/versions/:id` 仍然保留——深链与打印页要能直接按 id 取。

```http
GET /api/v1/versions/:id/body?format=markdown
→ 200 { "format": "markdown", "text": "# 美团 前端工程师\n…" }
```

`format=text|markdown`。PDF 不在这里——导出走浏览器打印（`CLAUDE.md` §5.8），服务端不生成 PDF。

---

## 5. 错误码表

**后端只给 `code`，文案由前端从 `states.ts` 取。** 这张表是两侧的共同依据。

| `code` | HTTP | 什么时候 | 前端状态表条目 |
| --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 没有会话或会话过期 | `not-logged-in` |
| `INVALID_CREDENTIALS` | 401 | 邮箱或密码不对 | `invalid-credentials` ✻ |
| `EMAIL_NOT_VERIFIED` | 403 | 邮箱没验证 | `email-not-verified` ✻ |
| `EMAIL_TAKEN` | 409 | 邮箱已注册 | `email-taken` ✻ |
| `INVALID_RESET_TOKEN` | 400 | 重置令牌无效或过期 | `invalid-reset-token` ✻ |
| `RESUME_NOT_FOUND` | 404 | 没有底稿 | `no-draft` |
| `VERSION_NOT_FOUND` | 404 | 版本不存在 | `version-not-found` |
| `DRAFT_REVISION_CONFLICT` | 409 | 修订号对不上 | `draft-conflict` ✻ |
| `PARSE_FAILED` | 422 | 认不出简历结构 | `parse-failed` |
| `RESUME_EMPTY` | 422 | 简历正文为空 | `parse-empty` |
| `JD_EMPTY` | 422 | JD 文本为空 | `jd-empty` |
| `JD_PARSE_FAILED` | 422 | JD 里认不出要求 | `jd-parse-failed` |
| `GENERATION_FAILED` | 422 | 生成版本失败 | `generate-failed` |
| `LLM_UNAVAILABLE` | 503 | 模型不可用且未能回落 | `llm-unavailable` ✻ |
| `LLM_TIMEOUT` | 504 | 模型超时 | `llm-timeout` ✻ |
| `RATE_LIMITED` | 429 | 触发限流 | `rate-limited` ✻ |
| `STORAGE_UNAVAILABLE` | 503 | 存储层不可用 | `storage-unavailable` |
| `VALIDATION_FAILED` | 400 | 请求体不合契约，`field` 指出字段 | `validation-failed` ✻ |
| `INTERNAL_ERROR` | 500 | 其它 | `internal-error` ✻ |

✻ = 状态表里还没有这条，随服务端落地补上（见 §5.1）。

**规则**：

- `code` 是**稳定契约**——一旦发布不改语义。要改语义就换 `code`。
- 每个 `code` 在前端 `states.ts` 里**恰好有一条**状态。有守卫断言这张表与状态表一一对应。
- 前端遇到**没登记**的 `code`：显示 `INTERNAL_ERROR` 对应的文案，并在控制台记一条。**不把后端的 `message` 直接显示给用户**——那句话没经过状态表的语气检查。
- `5xx` 一律带 `X-Request-Id`，前端在提示里带上它，用户截图时能定位。

### 5.1 新增的状态

`AUTH_REQUIRED` 之后这十个 `code` 在 P2 的状态表里还没有对应条目，随服务端落地一起补：

`invalid-credentials`、`email-not-verified`、`email-taken`、`invalid-reset-token`、`draft-conflict`、`llm-unavailable`、`llm-timeout`、`rate-limited`、`validation-failed`、`internal-error`。

补的时候按 `CLAUDE.md` §7 的用词规则走，**并且每条都要有下一步**（`error-states` 规格）。

---

## 6. 幂等

| 端点 | 幂等性 | 做法 |
| --- | --- | --- |
| 所有 `PUT` / `DELETE` | **天然幂等** | 重复调用结果相同 |
| `POST /api/v1/versions` | **不幂等**（每次生成一个新版本） | 必须带 `Idempotency-Key` |
| `POST /api/v1/auth/register` | **不幂等**（要发邮件） | 带 `Idempotency-Key`；同键重复请求不重发邮件、不重发确认 |
| `POST /api/v1/auth/login` | 不幂等 | 带 `Idempotency-Key`：同键不重复建会话 |
| `POST /api/v1/auth/password-reset` | 不幂等 | **不**用幂等键——用户要能重发。只靠限流 |
| `POST /api/v1/draft/parse`、`/jd/analyze`、`/diagnosis` | 无副作用 | 不需要幂等键 |
| `POST /api/v1/draft/import-local` | **不幂等**（要搬数据） | 带 `Idempotency-Key`：同键不重复迁移 |

**`Idempotency-Key` 的语义**：客户端生成一个 UUID，服务端记住 **24 小时**。同一个键的重复请求返回**第一次的结果**，不再执行副作用。

它解决的是「用户手快点了两下」与「网络超时后客户端重试」——这两件事都会造成重复生成版本、重复发邮件。**超时之后不要直接重发，先用同一个键重试**，这样即使第一次其实成功了，第二次也只是回放。

限流独立于幂等：限流按 IP + 账号 + 端点算，幂等按键算。

---

## 7. 分页

**页码分页**，不用游标。

```http
GET /api/v1/versions?page=1&pageSize=20
```

| 项 | 值 |
| --- | --- |
| `page` | 从 1 开始，默认 1 |
| `pageSize` | 默认 20，上限 **100**，超了按 100 处理（不报错） |
| `total` | 总条数 |

**为什么不用游标**：一个账号的版本数不大（个位数到几十），而且用户的心智是「第 2 页」——能跳页、能知道还剩多少。游标适合无限滚动的大数据量，这里用不上它的好处，却要付「不能跳页、总数拿不到」的代价。

`total` 是一次 `COUNT(*)`。数据量小，代价可忽略。

版本列表按 `createdAt` 倒序，同一时间戳用 `id` 兜底排序，保证分页稳定。

---

## 8. 上传语义

**没有上传端点。** PDF 的处理全在浏览器：

```
用户拖入 PDF
  → 浏览器用 pdf.js 提取文字层
  → 提取失败（无文字层 / 损坏 / 太大 / 有口令）→ 在浏览器里提示并引导改用「粘贴文本」
  → 提取成功 → 文本发给 POST /api/v1/draft/parse → 服务端解析成结构化底稿
```

**PDF 文件本身永远不离开浏览器。** 这是 P1 对用户的承诺（`pdf-intake` 规格），也是 `docs/privacy-conclusions.md` 里「简历正文的每个副本」的边界——PDF 不算副本。

因此服务端**没有**文件上传相关的错误码：文件大小、页数、口令、损坏这些判定全在客户端（`engines/pdfText.ts`），文案从 `states.ts` 取。

**存量本地数据迁移**是另一回事：`POST /api/v1/draft/import-local` 传的是**结构化简历数据**（JSON），不是文件。

---

## 9. 引擎端点与降级

引擎在服务端（ADR-0004）。前端不直接调引擎，只调上面的端点。

| 引擎调用 | 在哪个端点里 | 失败时 |
| --- | --- | --- |
| `parseDraft` | `POST /api/v1/draft/parse` | `422 PARSE_FAILED` |
| `diagnose` | `POST /api/v1/diagnosis` | `500 INTERNAL_ERROR`（诊断失败不该让用户重填简历） |
| `parseJd` + `evaluateJd` | `POST /api/v1/jd/analyze` | `422 JD_PARSE_FAILED` |
| `generateVersion` | `POST /api/v1/versions` | `422 GENERATION_FAILED`；模型不可用且回落失败 → `503 LLM_UNAVAILABLE` |

**降级链**（ADR-0005 §2）：LLM 输出没通过校验 → 回落到规则引擎产出 → 版本标记降级。**降级不是错误**，返回 `201` 而不是 `503`。

「模型不可用」与「模型输出不合格」是两回事：前者回落，后者也回落，但版本上的 `integrity.generator` 分别是 `rules` 与 `llm`。

---

## 10. 版本与兼容

- 路径前缀 `/api/v1`。不兼容的改动进 `/api/v2`，两个版本并行至少一个发布周期。
- **字段只能加**。加字段是向后兼容的；删字段、改字段语义、改枚举含义都不是。
- **枚举值只能加**。前端遇到没见过的枚举值要有兜底分支，不能崩。
- 废弃流程：标 `@deprecated` → 保留至少一个发布周期 → 下一个大版本删。
- 契约的破坏性变更由契约测试拦住（§11）。

---

## 11. 契约测试

验收项 A3.1：**契约文件与实现的字段/错误码一致性由测试断言。**

三层，从便宜到贵：

| 层 | 断言什么 | 什么时候跑 |
| --- | --- | --- |
| **schema 层** | 每个端点的请求/响应能被 schema 校验；实现与 schema 一致（Fastify 用 schema 校验入参与出参，不一致直接 500） | 每次测试 |
| **错误码层** | ① `states.ts` 里每条带 `code` 的状态，其 `code` 与本文档 §5 的表**一一对应**（不多、不少、不重复）；② 每个 `code` 在本文档的表里出现且仅出现一次 | 每次测试 |
| **端到端层** | 用真实请求打服务端，断言状态码、`error.code`、响应头（`X-Request-Id`、`Retry-After`） | 集成测试 |

**「一一对应」这条守卫是关键**：它保证「后端返回的码」与「前端能显示的文案」不会各走各的。改了错误码而忘了加状态（或反过来），测试立刻红。

实现上，服务端把 `docs/api-contract.md` §5 的表作为**唯一来源**生成一份 JSON，测试拿它与 `states.ts` 对照——不要在两处各写一份。

---

## 12. 还没定的

| # | 问题 | 现状 | 谁定 |
| --- | --- | --- | --- |
| 1 | 限流的具体阈值（每 IP / 每账号每分钟） | 未定；凭据类端点要更严 | 实现时按实际流量定 |
| 2 | `Idempotency-Key` 的存储位置与 TTL | 24 小时；存 Postgres 一张表还是 Redis | 实现时定（Redis 不在 v1.0 的技术栈里） |
| 3 | 生成版本的超时阈值 | 客户端 30 秒；服务端按引擎类型分级 | 实现时定 |
| 4 | 会话 cookie 的具体过期与续期窗口 | 30 天绝对有效期 + 滑动续期（ADR-0002） | 已定 |
| 5 | 账号删除后，生成日志的连带删除 | 按 `privacy-conclusions.md` §3，90 天到期删；注销时**立即删**还是随 90 天 | 待定——本文档倾向立即删 |
