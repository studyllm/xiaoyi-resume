## 1. 错误码表与状态表

- [ ] 1.1 `packages/shared/src/contracts/error-codes.ts`：19 个码 → HTTP 状态 + 状态条目
- [ ] 1.2 `StateCopy` 加 `code` 字段；给已有的九个状态补上码
- [ ] 1.3 补十个带码的新状态，每条都要有下一步
- [ ] 1.4 导出 `ALL_STATES`
- [ ] 1.5 守卫：错误码表与状态表一一对应（四种错都抓：码不存在、状态不存在、码用两次、表里有码没人用）

## 2. 服务端数据层

- [ ] 2.1 `db/schema.ts`：users / sessions / verification_tokens 三张表，邮箱唯一索引
- [ ] 2.2 `db/store.ts`：`AccountStore` 接口 + 内存实现 + Postgres 实现；密码哈希与令牌哈希；邮箱规范化
- [ ] 2.3 `db/migrate.ts`：版本号 + 迁移链 + 失败不白屏（单项与批量）
- [ ] 2.4 `db/migrations/` 的 SQL（drizzle-kit generate，进版本库）
- [ ] 2.5 用例：密码哈希、邮箱规范化、账号隔离、令牌一次性、迁移部分失败不白屏

## 3. 退役 delta（冻结点 F10）

- [ ] 3.1 `account-access` 整域重写：邮箱 + 密码 + 验证、找回密码、账号标识服务端签发
- [ ] 3.2 `prototype-runtime` 退役「原型不依赖后端」

## 4. 鉴权端点

- [ ] 4.1 `auth/session.ts`：会话 cookie（httpOnly + SameSite=Lax + Secure）、30 天绝对有效期、滑动续期、令牌只存哈希
- [ ] 4.2 `auth/mailer.ts`：发信接口 + 内存发信器（测试）+ 验证与重置两封信的文案
- [ ] 4.3 `auth/smtp.ts`：SMTP 发信（换服务商不用改代码）
- [ ] 4.4 `routes/auth.ts`：register / verify-email / login / logout / logout-all / password-reset / password-reset/confirm / me
- [ ] 4.5 `http/errors.ts`：按错误码表生成响应，文案取自共享的状态表
- [ ] 4.6 用例：注册发信但不建会话、邮箱已注册、验证后建会话、令牌一次性、登录、未验证不能登录、邮箱不存在与密码不对提示相同、cookie 是 httpOnly、登出、登出全清、找回密码（重置后旧密码失效且会话全失效）

## 5. 交接

- [ ] 5.1 **本变更不归档**——等前端接入完成、行为与规格一致了再归档
- [ ] 5.2 提醒：前端接入（登录界面、会话 store、路由守卫）与存量数据迁移是下一轮
- [ ] 5.3 提醒：Postgres 实现未被测试过，本地没有 Postgres
- [ ] 5.4 提醒：密码哈希用 scrypt 而非 ADR-0002 写的 argon2id，环境所限；部署环境能装原生模块就换回去，ADR 也要跟着改
