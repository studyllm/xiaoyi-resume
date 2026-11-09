## Why

调注册接口返回 502：

```json
{"error":{"code":"EMAIL_SEND_FAILED","message":"验证邮件没发出去"}}
```

**服务端日志里一个字都没有。** 只有「收到请求」和「请求完成 statusCode 502」两行——邮件为什么发不出去，一个字都没说。

根因在 `server/src/routes/auth.ts` 的注册处理器：

```ts
try {
  await mailer.send(verificationMail(mailConfig, user.email, token))
} catch {
  await store.deleteUser(user.id)
  return sendError(reply, 'EMAIL_SEND_FAILED')
}
```

`catch {}` 把错误整个吞掉。SMTP 到底为什么失败——连不上、认证被拒、超时、地址非法——全都没了。排障只能靠猜。

**实际原因**是本地环境少了一半：`docker compose ps` 只有 postgres，**Mailpit 没起**（它在 `profiles: ['mail']` 里，README 的快速开始只让跑 `npm run db:up`），SMTP 连 127.0.0.1:1025 连不上。

补上日志之后，第二个原因才浮出来：本地 `.env` 指的是真实邮件服务商，**端口 465（隐式 TLS）配了 `SMTP_SECURE=false`**，拿明文去连，对面直接掐断连接，报出来的是 `Connection closed unexpectedly`；改对之后又变成 `Invalid login: 526 Authentication failure`——**授权码不对**。

两轮下来暴露的是同一件事：**光有「失败了」没有「为什么失败、下一步做什么」**。所以这一版把失败分类（认证被拒 / 连不上 / 其它）、把失败发生在发信哪一步（`command`、SMTP 状态码）说清楚，并且让服务端在**启动时**就自检一次——配置错了不必等用户点注册。

## What Changes

- 注册发信失败时把失败原因记进服务端日志：`requestId` + 错误的名称、消息与机器可读的码（`ECONNREFUSED`、`EAUTH` 之类）。这是这次要的。
- **日志里说清失败发生在发信的哪一步、属于哪一类、下一步做什么。** nodemailer 的错误对象里有三样决定性的东西：`command`（`AUTH PLAIN` = 认证这一步）、`responseCode`（SMTP 状态码 526、535）与 `code`（`EAUTH`）。光看 message 只知道「认证失败」，看了这三样才知道是**认证被拒**——那是授权码不对，不是网络问题。
- **启动时自检发信**：拿配置的凭据登录一次 SMTP（只登录不发信）。认证被拒在启动时就暴露，不用等用户点注册才看到一个 502。
- 找回密码的发信失败同样记日志——现在它根本没被接住，冒泡成 500，用户看到的是「出了点问题」。
- 找回密码发信失败**仍然返回 204**：这个端点无论邮箱存不存在都返回 204（不泄露账号注册过），发信失败也不例外。现在的 500 只在「邮箱已注册」时出现——**等于用状态码泄露了账号是否存在**，与契约和 ADR-0002 §3 相悖。
- **SMTP 端口与加密方式不匹配时，服务端启动就退出并说清怎么改。** 465 是隐式 TLS 端口（RFC 8314），拿明文去连它，对面会直接掐断连接，报出来的是「Connection closed unexpectedly」——看不出是哪配错了。这是「带着半套配置跑起来的服务端比不启动更糟」（runbook §1.1）。
- 启动时把生效的发信目标（主机、端口、加密方式）打出来——配错时从这一行就能看出来。
- 启动时把生效的发信目标（主机、端口、加密方式）打出来——配错时从这一行就能看出来。
- README 的快速开始补上 Mailpit 的启动步骤。本地默认只起 postgres，注册链路默认就是坏的。
- `.env.example` 写清换成真实服务商时怎么填：端口与加密方式要对上、密码是**授权码**不是登录密码、账号要用服务商那边的发信账号。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `account-access`: 新增「发信失败要留下可定位的记录」与「发信配置错了要在启动时暴露」，并给「找回密码」补上「不因发信失败泄露账号是否存在」

## Impact

**代码**

- `server/src/routes/auth.ts`：注册与找回密码两处发信失败的处理
- `server/src/auth/smtp.ts`：SMTP 配置自检、失败分类、启动自检
- `server/src/auth/mailer.ts`：发信器加上「只登录不发信」的验明能力
- `server/src/http/logger.ts`：错误明细的提取（`app.ts` 里已有的同一段逻辑挪过来共用）
- `server/src/app.ts`：改用共用的错误明细提取，行为不变
- `server/src/auth/auth.spec.ts`、`server/src/auth/smtp.spec.ts`：回归用例
- `README.md`、`server/.env.example`：本地环境说明

**不受影响**

- 不改任何端点的路径、方法、请求体与响应体结构
- 不改 `EMAIL_SEND_FAILED` 这个码与它的用户文案
- 不记收件邮箱、不记令牌、不记简历正文——项目的脱敏口径（`docs/privacy-conclusions.md` §4.5）把它们列为要脱敏的项
- 不动 `verifyPassword` 里的 `catch`（哈希串格式不对按不匹配处理，那是有意的）
