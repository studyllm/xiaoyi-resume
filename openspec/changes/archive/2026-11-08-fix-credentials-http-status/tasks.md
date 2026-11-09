## 1. 凭据不对改用 403

- [x] 1.1 `packages/shared/src/contracts/error-codes.ts`：`INVALID_CREDENTIALS` 的 http 从 401 改成 403。**自动化验收**：服务端用例断言 403，见 1.2、1.3
- [x] 1.2 `server/src/auth/auth.spec.ts`：凭据不对的断言改成 403，测试名写清「不占用 401」；重置密码后用旧密码登录的断言也一并改
- [x] 1.3 `server/src/auth/auth.spec.ts`：「邮箱没验证时不能登录」已断言 403——确认它与凭据不对同码，即「服务器认识这个账号，但你现在进不去」

## 2. 契约文档同步

- [x] 2.1 `docs/api-contract.md` §4.1：登录失败那一句从 `401 INVALID_CREDENTIALS` 改成 `403`
- [x] 2.2 `docs/api-contract.md` §5：错误码表里 `INVALID_CREDENTIALS` 的 HTTP 列改成 403，并写清 401 在这套 API 里只有「需要登录态」一个意思

## 3. 验证

- [x] 3.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 `frontend`: `npm run type-check` 与 `npm test` 全绿——错误码与状态表一一对应的守卫不受影响
- [x] 3.3 手工：`curl -X POST http://localhost:5173/api/v1/auth/login -d '{"email":"nobody@example.com","password":"x"}'` → 403 + `INVALID_CREDENTIALS`
- [x] 3.4 手工：未带会话访问 `GET /api/v1/me` → 仍是 401 + `AUTH_REQUIRED`
- [x] 3.5 仓库根：`npm run verify` 全绿
