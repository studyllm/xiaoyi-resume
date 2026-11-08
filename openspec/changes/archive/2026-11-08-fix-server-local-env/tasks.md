## 1. 读环境变量文件

- [x] 1.1 `server/src/config/env.ts`（新增）：`loadLocalEnv(dir)`——文件存在就 `process.loadEnvFile`，不存在返回 false。**自动化验收**：三个用例，见 1.3
- [x] 1.2 `server/src/index.ts`：在读任何环境变量之前调 `loadLocalEnv`；`required()` 缺变量时报错带上补救步骤
- [x] 1.3 `server/src/config/env.spec.ts`（新增）：文件在时读得到值 / 进程环境里已有的同名变量不被覆盖 / 文件不存在时返回 false 且不抛错

## 2. 门禁放行被忽略的环境变量文件

- [x] 2.1 `frontend/src/repo-hygiene.spec.ts`：环境变量文件的检查改用 git 的忽略规则判断——被忽略的放行，没被忽略的拦下
- [x] 2.2 `frontend/src/repo-hygiene.spec.ts`：两个用例覆盖上一步——`server/.env` 与 `server/.env.local` 放行，`docs/notes.env` 拦下

## 3. 文档

- [x] 3.1 `README.md`：快速开始补上「复制环境变量文件」这一步，并说明不复制服务端起不来
- [x] 3.2 `server/.env.example`：确认它写的「复制成 .env 后按需改」与实际行为一致

## 4. 验证

- [x] 4.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 4.2 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 4.3 手工：`cp server/.env.example server/.env` → `npm run dev:server` → 服务端起得来（此前报「缺少环境变量 DATABASE_URL」）
- [x] 4.4 手工：服务端起着时，`curl http://localhost:5173/api/v1/me` 经前端代理返回 401 与 `AUTH_REQUIRED`，不是 500
- [x] 4.5 仓库根：`npm run verify` 全绿
