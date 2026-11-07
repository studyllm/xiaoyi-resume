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

## 4. 交接

- [ ] 4.1 **本变更不归档**——等前端接入完成、行为与规格一致了再归档
- [ ] 4.2 提醒：鉴权端点（注册/验证/登录/登出/找回密码）下一轮写
- [ ] 4.3 提醒：Postgres 实现未被测试过，本地没有 Postgres
