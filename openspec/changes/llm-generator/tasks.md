## 1. 共享包：端口与生成器

- [x] 1.1 `engines/generator.ts`：`ResumeGenerator` 端口与 `rules` 实现（包一层现有 `generateVersion`）
- [x] 1.2 `engines/llmPrompt.ts`：拼提示词、解析响应（抽取 JSON、容错、引用序号映射回 fact）
- [x] 1.3 `engines/generator.ts` 的 `llm` 实现：先跑规则产出作底稿 → 调模型 → 逐条造 claim → 判定 → 不可信就换回规则产出 → 重算 diff 与正文
- [x] 1.4 `domain/types.ts`：`integrity` 补 `generator` / `reverted` / `degraded` / `observations`；`ResumeVersion` 补 `trace`（facts 与 claims）
- [x] 1.5 `draftTermsOf` 挪进 `ledger.ts`，规则生成器与模型生成器共用

## 2. 服务端：模型调用与日志

- [x] 2.1 `llm/client.ts`：OpenAI 格式的 `chat/completions` 客户端——超时、重试有上限、token 上限、返回 usage
- [x] 2.2 `llm/config.ts`：从环境读 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_TIMEOUT_MS` / `LLM_MAX_TOKENS`，没配就当没有供应商
- [x] 2.3 `generations` 表与迁移；`store.ts` 补写入与读取
- [x] 2.4 `routes/resume.ts`：按配置选生成器，把这次生成写进日志

## 3. 前端：把话说清楚

- [x] 3.1 版本详情页说明这一版是模型生成还是规则生成、有多少处回退、有没有降级
- [x] 3.2 文案过禁用词与用词检查（不得出现「底稿」）

## 4. 规格与决策记录

- [x] 4.1 ADR-0005 的「相关变更」指向本变更
- [x] 4.2 ADR-0003 §6 的 `integrity` 新形状按实现补说明

## 5. 验收

- [x] 5.1 共享包、前端、服务端三处门禁全过
- [x] 5.2 用例覆盖：端口契约、模型输出解析、编造被换回、职责上调被换回、超时降级、坏 JSON 降级、日志写入
- [ ] 5.3 浏览器走一遍生成版本：模型生成、降级两种情形都看过

## 6. 没做完的（下一段）

- [ ] 6.1 前端的「本次用模型」开关——**前端目前仍在本地生成**，「简历与版本改走服务端」那段工作还卡在 `feat/p3-server-endpoints` 分支上没合进来（PR #26 rebase 时丢了两个提交）。前端接上服务端的生成端点之后，这个开关才有地方放。
- [ ] 6.2 每日生成次数与成本上限、同输入缓存
