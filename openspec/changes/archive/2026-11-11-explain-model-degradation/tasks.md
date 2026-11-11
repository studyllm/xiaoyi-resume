## 1. 降级原因进版本

- [x] 1.1 `packages/shared/src/domain/types.ts`：`IntegrityReport` 加 `degradeReason`
- [x] 1.2 `packages/shared/src/engines/generator.ts`：降级时把原因写进版本
- [x] 1.3 `packages/shared/src/engines/generator.spec.ts`：降级时版本里带着原因

## 2. 界面说清原因

- [x] 2.1 `packages/shared/src/domain/states.ts`：加一条给界面用的状态
- [x] 2.2 `frontend/src/views/JdView.vue`：生成完当场提示降级原因
- [x] 2.3 `frontend/src/views/VersionDetailView.vue`：详情页那句带上原因
- [x] 2.4 `frontend/src/views/JdView.spec.ts`：提示里有那个原因

## 3. 超时不重试

- [x] 3.1 `server/src/llm/client.ts`：超时不重试
- [x] 3.2 `server/src/llm/client.spec.ts`：超时只发一次

## 4. 配置说明

- [x] 4.1 `server/.env.example`：超时与输出上限按「一整版简历」定，给实测值

## 5. 验证

- [x] 5.1 `npm run verify`（仓库根）全绿
- [x] 5.2 手工：真实模型超时时，生成完当场看到原因
