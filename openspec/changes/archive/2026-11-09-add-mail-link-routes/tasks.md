## 1. 链接路径放进共享包

- [x] 1.1 `packages/shared/src/domain/links.ts`（新增）：`VERIFY_EMAIL_PATH` 与 `RESET_PASSWORD_PATH`
- [x] 1.2 `server/src/auth/mailer.ts`：建链接时用共享包里的路径，不再各写一份
- [x] 1.3 `frontend/src/router/index.ts`：路由路径取自共享包

## 2. 把两个页面接在路由上

- [x] 2.1 `frontend/src/router/index.ts`：注册 `/verify-email` 与 `/reset-password`，标 `public: true`——从邮件进来的人还没有登录态
- [x] 2.2 两个页面的界面与文案一个字不改（它们本来就是对的，只是没被路由到）

## 3. 守卫

- [x] 3.1 `frontend/src/flows.spec.ts`：邮件链接指向的路径，前端路由里必须都有
- [x] 3.2 `frontend/src/flows.spec.ts`：`views/` 下的每个页面组件都必须接在路由上

## 4. 文档

- [x] 4.1 `CLAUDE.md` §1：`domain/` 的说明补上 links.ts

## 5. 验证

- [x] 5.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 5.2 手工：对着 Mailpit 注册 → 从 Mailpit 取出验证链接 → 无头浏览器打开 → 页面显示「邮箱已验证」
- [x] 5.3 手工：打开 `/reset-password?token=…` → 落到重置密码页（不是落地页）
- [x] 5.4 仓库根：`npm run verify` 全绿
