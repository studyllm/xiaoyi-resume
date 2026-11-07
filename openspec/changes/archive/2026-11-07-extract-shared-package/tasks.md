## 1. 搬文件

- [x] 1.1 `frontend/src/domain/` → `packages/shared/src/domain/`
- [x] 1.2 `frontend/src/engines/` → `packages/shared/src/engines/`（`pdfText.*` 除外）
- [x] 1.3 `pdfText.ts` 与它的用例 → `frontend/src/pdf/`
- [x] 1.4 41 个文件的 import 改走包名 `@xiaoyi/shared/*`；共享包内部改成相对路径

## 2. 工程配置

- [x] 2.1 根 `package.json` 声明 workspaces（`frontend` + `packages/shared`）
- [x] 2.2 `packages/shared/package.json`：包名、exports、vitest 作为 devDependency
- [x] 2.3 lockfile 从 `frontend/` 移到根目录，`npm install` 重新生成
- [x] 2.4 `vite.config.ts`：vitest 的 include 收共享包的用例
- [x] 2.5 `tsconfig.app.json`：include 收共享包源码
- [x] 2.6 `copy-pdfjs-assets.mjs`：依赖位置改成「两处都找，找不到就报错」
- [x] 2.7 CI：安装依赖移到仓库根，缓存路径改成根 lockfile

## 3. 文档

- [x] 3.1 `CLAUDE.md`：目录结构、路径别名说明、常用命令
- [x] 3.2 `docs/backend-stack.md` 的目录结构一节
- [x] 3.3 计划书：F9 冻结点、T3.4 状态、P3 交付范围里的路径

## 4. 验收

- [x] 4.1 `npm run verify` 四项全过
- [x] 4.2 **用例总数与抽取前一致**（540）——变了说明有测试被漏掉或重复计入
- [x] 4.3 确认 `frontend/node_modules` 不存在，依赖都在根目录
