## 1. 发信失败记下原因

- [x] 1.1 `server/src/http/logger.ts`：加 `errorDetail(error)`——只取 `name`、`message` 与 `code` 三个字段，不整包丢错误对象
- [x] 1.2 `server/src/app.ts`：改用 `errorDetail`，行为不变
- [x] 1.3 `server/src/routes/auth.ts` 注册端点：发信失败时先记日志（请求 id + 失败原因），再删账号、回 502
- [x] 1.4 `server/src/routes/auth.ts` 找回密码端点：接住发信失败，记日志，**仍返回 204**（不因失败暴露账号是否存在）

## 2. 配置错了在启动时暴露

- [x] 2.1 `server/src/auth/smtp.ts`：加 `checkSmtpConfig`——端口 465 而加密方式不是隐式 TLS 就报错
- [x] 2.2 `server/src/index.ts`：启动时自检，不通过就退出并说清怎么改；并打出生效的发信目标（主机、端口、加密方式）
- [x] 2.3 `server/src/auth/smtp.spec.ts`（新增）：465 配明文报错 / 465 配隐式 TLS 通过 / 1025 配明文通过

## 3. 回归用例

- [x] 3.1 `server/src/auth/auth.spec.ts`：注册发信失败时回 502、账号被删掉，且日志里有失败原因
- [x] 3.2 `server/src/auth/auth.spec.ts`：找回密码发信失败时仍回 204（不是 500），且日志里有失败原因
- [x] 3.3 `server/src/auth/auth.spec.ts`：日志里不出现令牌与收件邮箱

## 4. 文档

- [x] 4.1 `README.md`：快速开始把 Mailpit 一起起来，并说明它默认不在 `db:up` 里
- [x] 4.2 `server/.env.example`：写清 `SMTP_SECURE` 要跟端口对上、`SMTP_PASS` 是授权码不是登录密码
- [x] 4.3 `docs/api-contract.md` §4.1：写明注册发信失败回 502、找回密码无论邮箱存不存在都回 204

## 5. 验证

- [x] 5.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 5.2 手工：停掉 Mailpit 后注册 → 服务端日志出现「验证邮件发送失败」与底层原因（`ECONNREFUSED` 之类），响应 502
- [x] 5.3 手工：起回 Mailpit 后注册 → 201，Mailpit 界面（http://localhost:8025）里能看到验证信
- [x] 5.4 手工：端口 465 配 `SMTP_SECURE=false` 时启动 → 服务端退出并说清怎么改
- [x] 5.5 仓库根：`npm run verify` 全绿
