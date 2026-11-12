## 1. 失败原因指向该调什么

- [x] 1.1 `server/src/llm/client.ts`：超时翻译成「调大 LLM_TIMEOUT_MS」，保留 name 与 cause
- [x] 1.2 `server/src/llm/client.ts`：`finish_reason === 'length'` 认成「输出被截断」，指向 `LLM_MAX_TOKENS`
- [x] 1.3 `server/src/llm/client.spec.ts`：两条用例

## 2. 配置说明

- [x] 2.1 `server/.env.example`：按实测补上规模与时长的对应关系

## 3. 验证

- [x] 3.1 `server`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 仓库根：`npm run verify` 全绿
