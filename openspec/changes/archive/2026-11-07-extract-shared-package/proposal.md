## Why

F9 是「引擎在两端漂移 →『同一输入同一输出』的结构保证失效」这条风险的解药，而它要在 P3 开工前冻结。

现在 `domain/` 与 `engines/` 住在 `frontend/src/` 里。P3 要让服务端跑同一份引擎——如果那时候才开始抽，两端各有一份引擎的日子里，任何一次改动都可能只改一边。**共享包必须在服务端存在之前抽好**，否则「同一份源码」这个保证从第一天起就是假的。

服务端落地之后，「同一仓库双工作区 vs 独立包」这个选项也要定下来：同仓库但靠路径别名解析，那只是约定，约定会被绕过；npm workspace 的包边界由解析器强制。

## What Changes

- 新建 `packages/shared/`（npm workspace，包名 `@xiaoyi/shared`）：`domain/` 与 `engines/` 从 `frontend/src/` 搬进来，41 个文件的 import 改走包名。
- 仓库根建 `package.json` 声明 workspaces；lockfile 从 `frontend/` 移到根目录；CI 的安装步骤与缓存路径跟着改。
- `pdfText.ts` 留在前端，挪到 `frontend/src/pdf/`——pdf.js 是浏览器能力，且 P1 承诺过文件不上传，它不属于共享包。
- 共享包内部用相对路径，**不引用自己的包名**——包不该依赖自己。
- `CLAUDE.md` 的目录结构、路径别名说明、常用命令；`docs/backend-stack.md` 的目录结构一节；计划书的 F9 冻结点与 T3.4 状态。

**不改动任何能力域的 REQUIREMENT。** 这次是纯结构调整，行为不变——540 个用例的个数与断言全部不变。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

（无——纯结构调整，没有行为变化。）

## Impact

- 移动文件：`frontend/src/domain/` → `packages/shared/src/domain/`；`frontend/src/engines/` → `packages/shared/src/engines/`（`pdfText.*` 除外）。
- 改动文件：41 个 import 引用点、`frontend/vite.config.ts`、`frontend/tsconfig.app.json`、`frontend/scripts/copy-pdfjs-assets.mjs`、`.github/workflows/ci.yml`、`CLAUDE.md`、`docs/backend-stack.md`、`docs/产品开发计划-v1.0.md`。
- lockfile 从 `frontend/package-lock.json` 移到 `package-lock.json`；`frontend/node_modules` 不再存在，依赖装在仓库根。
- **T3.4 还差最后一步**：`server/` 还没立起来。它建起来时接上同一个包，F9 的保证才真正闭合。
