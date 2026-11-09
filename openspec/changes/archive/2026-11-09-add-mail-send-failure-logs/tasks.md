## 1. 发信失败记下原因

- [x] 1.1 `server/src/http/logger.ts`：加 `errorDetail(error)`——只取白名单字段，不整包丢错误对象
- [x] 1.2 `server/src/app.ts`：改用 `errorDetail`，行为不变
- [x] 1.3 `server/src/routes/auth.ts` 注册端点：发信失败时先记日志（请求 id + 失败原因），再删账号、回 502
- [x] 1.4 `server/src/routes/auth.ts` 找回密码端点：接住发信失败，记日志，**仍返回 204**（不因失败暴露账号是否存在）

## 2. 失败要分类，并说清下一步

- [x] 2.1 `server/src/http/logger.ts`：`errorDetail` 加上 `command` 与 `responseCode`（失败在哪一步、SMTP 状态码）
- [x] 2.2 `server/src/auth/smtp.ts`：加 `describeSmtpFailure`——把失败分成认证被拒 / 连不上 / 其它，各给一句中文原因与一条下一步
- [x] 2.3 `server/src/routes/auth.ts`：注册与找回密码的日志用分类结果，原始细节仍记在 `err` 里

## 3. 配置错了在启动时暴露

- [x] 3.1 `server/src/auth/smtp.ts`：加 `checkSmtpConfig`——端口 465 而加密方式不是隐式 TLS 就报错
- [x] 3.2 `server/src/auth/mailer.ts`：`MailSender` 加 `verify()`（只登录不发信）
- [x] 3.3 `server/src/auth/smtp.ts`：加 `checkSmtp`——拿凭据登录一次，失败时给出分类结果
- [x] 3.4 `server/src/index.ts`：启动时自检并打出生效的发信目标；凭据被拒时醒目提示但**不阻止启动**（邮件只影响注册与找回密码）
- [x] 3.5 `server/src/auth/smtp.spec.ts`（新增）：配置自检 / 失败分类 / 自检通过与失败

## 4. 回归用例

- [x] 4.1 `server/src/auth/auth.spec.ts`：注册发信失败时回 502、账号被删掉，且日志里有失败原因
- [x] 4.2 `server/src/auth/auth.spec.ts`：找回密码发信失败时仍回 204（不是 500），且日志里有失败原因
- [x] 4.3 `server/src/auth/auth.spec.ts`：日志里不出现令牌与收件邮箱

## 5. 文档

- [x] 5.1 `README.md`：快速开始把 Mailpit 一起起来，并说明它默认不在 `db:up` 里
- [x] 5.2 `server/.env.example`：写清 `SMTP_SECURE` 要跟端口对上、`SMTP_PASS` 是授权码不是登录密码、`SMTP_USER` 要用服务商那边的发信账号
- [x] 5.3 `docs/api-contract.md` §4.1：写明注册发信失败回 502、找回密码无论邮箱存不存在都回 204

## 6. 验证

- [x] 6.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 6.2 手工：停掉 Mailpit 后注册 → 服务端日志出现「验证邮件发送失败」与底层原因（`ECONNREFUSED` 之类），响应 502
- [x] 6.3 手工：起回 Mailpit 后注册 → 201，Mailpit 界面（http://localhost:8025）里能看到验证信
- [x] 6.4 手工：端口 465 配 `SMTP_SECURE=false` 时启动 → 服务端退出并说清怎么改
- [x] 6.5 手工：凭据被拒时启动 → 打印中文原因与下一步，服务端照常起来
- [x] 6.6 仓库根：`npm run verify` 全绿
