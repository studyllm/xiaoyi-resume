## 1. 版本 id 不再撞

- [x] 1.1 `packages/shared/src/domain/ids.ts`：`createIdSeed(startFrom?)`——支持给起始计数，默认不变
- [x] 1.2 `server/src/routes/resume.ts`：版本 id 用进程级种子（起始计数为进程启动时间），不再每个请求新建
- [x] 1.3 `server/src/routes/resume.spec.ts`：连续生成两个版本 → id 不同，两个都存下来

## 2. 验证

- [x] 2.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 2.2 手工：库里已有 version-1 的状态下生成一个版本 → 201
- [x] 2.3 仓库根：`npm run verify` 全绿
