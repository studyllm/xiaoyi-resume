## Why

打开页面时控制台报 `GET /api/v1/me 500 (Internal Server Error)`。这个 500 不是我们的服务端发的——它是 Vite 开发代理在后端连不上时自己造的（响应体是空的 `text/plain`，没有 `x-request-id`）。

后端为什么连不上：`npm run dev:server` 一启动就退出，报「缺少环境变量 DATABASE_URL」。

按 `server/.env.example` 的说法，开发者应该复制一份 `.env` 再改。实测把 `.env.example` 复制成 `.env` 之后，`npm run dev:server` 报的还是同一个错——**没有任何代码读这个文件**。同时 README 的快速开始里也没有「复制 `.env`」这一步，照着走必然撞上这个错。

## What Changes

- 服务端启动时读取 `server/.env`，让「复制样例后按需修改」这条步骤真的成立。
- 进程环境里已有的同名变量优先于文件里的取值——部署时由进程管理器注入的配置不能被本机文件盖掉。
- 文件不存在时不报错。部署环境没有这个文件，缺它是正常情况。
- 缺环境变量时退出，报错里写清本地怎么补上——现在只说「缺少环境变量 DATABASE_URL」，不说下一步做什么。
- README 的快速开始补上复制 `.env` 这一步。
- 仓库卫生守卫改判「会不会被提交」而不是「磁盘上有没有」：本地开发要在 `server/.env` 里放配置，那份文件被 git 忽略，守卫不该拦它。规格写的是「不入库」，守卫扫的是磁盘，两边对不上。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `test-and-ci`: 新增「本地启动读环境变量文件」；「仓库不含误生成产物与机密」补一条场景，说明被忽略的环境变量文件不算入库

## Impact

**代码**

- `server/src/config/env.ts`（新增）：读环境变量文件的小函数
- `server/src/config/env.spec.ts`（新增）：回归用例
- `server/src/index.ts`：启动时读文件；缺变量的报错带上补救步骤
- `frontend/src/repo-hygiene.spec.ts`：环境变量文件的检查改用 git 的忽略规则判断
- `README.md`：快速开始补一步

**不受影响**

- 不改接口、错误码与状态表
- 不改前端界面
- 不新增依赖（Node 22 自带 `process.loadEnvFile`）
- 不改部署路径：部署时没有 `.env`，行为一个字不变
