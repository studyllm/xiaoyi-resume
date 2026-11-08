## Why

「不编造」的判定已经换成声明级（`fact-ledger-and-verifier`）。现在可以让模型参与生成了——但**模型的输出不被信任**。

规则引擎写出来的东西是「重排已有字符」，它的措辞永远带着规则的腔调。模型能写出更自然的表达，但模型也会编造：「把 18s 写成 8s」「把参与写成负责」这类事它做得出来，而简历上的一个假数字是真实的投递损失。

所以这一段的重点不是「接上模型」，是**接上一条模型输出不被信任的流水线**：模型产出先过事实账本，不合格的要点回退为规则引擎的产出；模型不可用时整版回落规则产出，功能不中断。

## What Changes

- **共享包新增 `engines/generator.ts`**：`ResumeGenerator` 端口，`rules` 与 `llm` 两个实现（ADR-0005 §2）。视图与状态层不感知实现差异。
- **共享包新增 `engines/llmPrompt.ts`**：拼提示词与解析响应。**引用用子句序号，不让模型抄 factId 哈希**——抄错一位就查不出依据了。
- **服务端新增 `llm/client.ts`**：OpenAI 格式的 `chat/completions` 客户端。**密钥只在服务端**，读 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`；带超时、重试与单次 token 上限。
- **生成日志落在我们自己的库里**（ADR-0005 §5）：新增 `generations` 表，记模型 id、提示词版本、token 数、校验结论与模型原始输出。不重复存简历正文——输入用引用。
- **`integrity` 补三个字段**：`generator`（这一版的正文是谁写的）、`reverted`（有多少条要点回退了）、`degraded`（整版是否降级生成）。版本里带上 `trace`（facts 与 claims），一份版本能被独立审计。
- **界面可见**：版本详情页说明这一版是模型生成还是规则生成、有多少处回退、有没有降级。
- **口径修正**：`jd-version-generation` 的「生成结果可复现」在模型生成时不成立——那条要求要写明规则引擎下可复现、模型生成下可审计，不能默默破坏它。

## Capabilities

### New Capabilities

- `llm-engine`：模型参与的版本生成——输出不被信任、逐条判定、按要点回退、不可用时降级、每次生成可审计。

### Modified Capabilities

- `jd-version-generation`：「生成结果可复现」补上模型生成时的口径（可审计而非可复现）；「只重组、删减、强调底稿中已有的事实」补上「模型生成的要点同样受检」的场景。

## Impact

- 新增文件：共享包 `engines/generator.ts`、`engines/llmPrompt.ts`；服务端 `llm/client.ts`。
- 改动文件：`packages/shared/src/domain/types.ts`（`integrity` 与 `trace`）、`packages/shared/src/engines/generateVersion.ts`（规则产出作为回退底稿）、`server/src/routes/resume.ts`（按配置选生成器）、`server/src/db/schema.ts` 与 `store.ts`（`generations` 表）、`frontend/src/views/VersionDetailView.vue`（降级与回退的呈现）。
- **落库结构变更**：`generations` 表要加迁移；版本 payload 是 jsonb，`integrity` 与 `trace` 的新字段不需要迁移。
- **默认行为不变**：没配 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 时，生成路径就是现在的规则引擎，产物逐字一致。
- **依赖外部服务**：模型调用是外部依赖，测试用注入的假端口跑，不连真实供应商。
