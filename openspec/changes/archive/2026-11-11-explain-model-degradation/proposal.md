## Why

模型调通之后点「生成版本」，界面还是写「模型这次没有用上，这一版由规则引擎生成」——**只说没用上，不说为什么**。

排查下来这次的原因是**超时**：模型要 29.5 秒，而 `LLM_TIMEOUT_MS` 默认 30 秒，刚好卡在边界上；而且 `max_tokens=2000` 会把输出截断（`finish_reason: length`），截断的 JSON 校验过不了，一样回落规则引擎。

用户能做的只有两件：**充值**（402 那次）与**调配置**（超时与输出上限）。但界面与日志都不给他这两条线索——生成的那一刻前端只弹一句「版本已生成」，原因在生成日志里，日志里也只有「模型返回 402」这种没有指向的句子。

## What Changes

- **版本里带上降级的原因**（`integrity.degradeReason`），界面两处都用它：生成完当场提示，版本详情页那句也带上。
- **超时不重试**：同样的输入再发一次还是那么慢，白等一遍还把用户的等待翻倍。
- `.env.example` 写清超时与输出上限该按「一整版简历」来定，并给出实测值。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `jd-version-generation`: 新增「模型没调通时界面要说清原因」

## Impact

**代码**

- `packages/shared/src/domain/types.ts`：`IntegrityReport` 加 `degradeReason`
- `packages/shared/src/engines/generator.ts`：降级时把原因写进版本
- `packages/shared/src/domain/states.ts`：加一条给界面用的状态
- `frontend/src/views/JdView.vue`：生成完当场提示降级原因
- `frontend/src/views/VersionDetailView.vue`：详情页那句带上原因
- `server/src/llm/client.ts`：超时不重试
- `server/.env.example`：配置怎么定

**不受影响**

- 不改降级链的行为（模型不可用仍回落规则引擎，仍返回 201）
- 不改端点的路径、请求体与响应体的结构（版本对象多一个字段，契约原则 3 允许加字段）
- 不改简历正文与事实账本的校验口径
