## Why

登录之后所有接口都 500，服务端日志是：

```
Failed query: select "id", "email", … "model_consent_at" … from "users" where …
```

**库比代码旧**——`0003_jd_analysis_and_model_consent.sql` 这条迁移在仓库里，数据库里没跑过，所以 `users` 表没有 `model_consent_at` 这一列，查询直接失败。

两个问题：

1. **该跑的迁移没跑**（环境问题，已修：跑了 `npm run db:migrate`）。
2. **报出来的错没法据以行动**。Drizzle 的消息是「Failed query: select … params: …」——没人能据此判断「这是库旧了，跑迁移就行」。

## What Changes

- 数据库报「列不存在」（`42703`）或「表不存在」（`42P01`）时，服务端日志里补一句**能做的**：「数据库版本比代码旧（缺少表或列）。请跑 npm run db:migrate，然后重启服务端。」
- 响应体不变（`500 INTERNAL_ERROR`）——终端用户不需要看技术细节，开发者看日志就够。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `prototype-runtime`: 新增「库比代码旧时给出可操作的下一步」

## Impact

**代码**

- `server/src/http/errors.ts`：`describeMissingSchema`
- `server/src/app.ts`：错误处理里用它补日志
- `server/src/http/errors.spec.ts`：三条用例

**不受影响**

- 不改接口、错误码与用户文案
- 不改迁移本身（那条迁移是对的，只是没跑）
- 不自动跑迁移——服务端不碰用户的库
