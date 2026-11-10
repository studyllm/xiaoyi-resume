## 1. 前端调服务端解析

- [x] 1.1 `frontend/src/api/resume.ts`：加 `parseResume(text)`——POST `/api/v1/draft/parse`
- [x] 1.2 `frontend/src/stores/draft.ts`：`ingest` 改成异步，走服务端；失败时按错误码取状态（`parse-empty` / `parse-failed` / 离线）
- [x] 1.3 `frontend/src/stores/draft.ts`：`ingest` 的返回形状改成自己的（`{ok:true, draft, confidence, warnings, otherHeaders}` / `{ok:false, failure:{state}}`）
- [x] 1.4 `frontend/src/views/ImportView.vue`：解析改成异步等待；服务端不可达时说清连不上与下一步
- [x] 1.5 `frontend/src/mock/loadDemo.ts`：演示数据那一步改成等待

## 2. 认得出「连不上」

- [x] 2.1 `packages/shared/src/domain/states.ts`：加一条给解析用的「连不上」状态（下一步是「等它恢复后再解析」）
- [x] 2.2 `frontend/src/api/client.ts`：5xx 且正文不是 JSON 时判成「连不上」
- [x] 2.3 `frontend/src/stores/draft.ts`：解析失败且是「连不上」时用那条新状态

## 3. 测试

- [x] 3.1 `frontend/src/stores/draft.spec.ts`：解析走接口（断言接口被调用）；空正文给出「没有可解析的内容」；服务端不可达给出离线状态
- [x] 3.2 `frontend/src/views/ImportView.spec.ts`：粘贴与上传两条路径都走接口；`@/api/resume` 的 mock 补上 `parseResume`
- [x] 3.3 `frontend/src/flows.spec.ts`：`@/api/resume` 的 mock 补上 `parseResume`

## 4. 文档

- [x] 4.1 `README.md`：「解析、诊断与版本生成由服务端的规则引擎完成」改成实际的样子——解析与版本生成走服务端，诊断与 JD 解析在浏览器
- [x] 4.2 `docs/api-contract.md`：端点落地状态那行更新（`POST /api/v1/draft/parse` 现在真的有调用方了）

## 5. 验证

- [x] 5.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 5.2 手工：导入页粘贴一份简历 → Network 面板出现 `POST /api/v1/draft/parse` → 纸面上出现解析结果
- [x] 5.3 手工：停掉服务端再解析 → 界面说明连不上服务器并给出下一步
- [x] 5.4 仓库根：`npm run verify` 全绿
