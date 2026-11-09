## Why

点邮件里的验证链接，页面要求登录；输入邮箱密码登录，提示「邮箱还没验证。去查收验证邮件并点开链接；没收到就重新发一封。」

**死循环**：验证链接要登录，登录被「邮箱没验证」挡住，而验证邮箱的页面根本进不去。

根因：`frontend/src/views/VerifyEmailView.vue` 与 `ResetPasswordView.vue` **都写好了，但从来没接在路由上**。`frontend/src/router/index.ts` 的兜底路由把没注册的路径全都送去 `/draft`：

```ts
{ path: '/:pathMatch(.*)*', redirect: '/draft' }
```

于是 `/verify-email?token=…` → `/draft` → 该页要登录 → 守卫送回落地页并打开身份对话框 → 用户输入邮箱密码 → **邮箱从来没被验证过**（验证那一段代码压根没跑）→ 403「邮箱还没验证」。

无头浏览器实测：打开 `http://localhost:5173/verify-email?token=abc123` 落到的是**落地页**，不是「验证邮箱」页。

重置密码的链接（`/reset-password?token=…`）同样没接路由——那条路走不通，只是还没人踩到。

## What Changes

- **把验证邮箱与重置密码两个页面接在路由上**，并标成公开页——从邮件进来的链接不能要求先登录。
- **邮件链接的路径挪到共享包里**，服务端建链接与前端接路由引用同一份定义。两边各写一份路径、对不上没人拦，正是这次出问题的根源（`CLAUDE.md` §1：「共享包不是复制…同一输入同一输出靠结构保证」）。
- **加两条守卫**：
  - 邮件链接指向的路径，前端路由里必须都有。
  - `views/` 下的每个页面组件都必须接在路由上——「视图写了、路由忘了」这种半截实现不该再溜过去。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `account-access`: 新增「邮件里的链接要能落到对应的页面」

## Impact

**代码**

- `packages/shared/src/domain/links.ts`（新增）：两个链接路径
- `frontend/src/router/index.ts`：注册两条路由，路径取自共享包
- `server/src/auth/mailer.ts`：建链接时用共享包里的路径
- `frontend/src/flows.spec.ts`：两条守卫
- `CLAUDE.md` §1：目录说明补一句

**不受影响**

- 不改任何接口、错误码与状态表
- 不改服务端与前端的其它行为
- 两个页面的界面与文案一个字不改——它们本来就是对的，只是没被路由到
