> 每条任务对应一个可验证的行为。顺序：共享包 → 服务端 → 前端 → 文档 → 验收。
> A 组必须串行（A1→A2→A3→A4 依赖链）；B5 / C1 / C2 可与 A 组并行；D 组在 B、C 之后；E 组最后。
> 追溯：任务括号里的 D1–D10 指本变更 design.md 的决策；「设计 §7 A1」指 `docs/designs/jd-generation-pipeline-clarity.md` §7 的任务拆分。

## 1. 共享包 · 候选筛选与覆盖复核（设计 §7 A1–A2）

- [ ] 1.1 新增 `packages/shared/src/engines/candidateSelection.ts`：`selectCandidates(evidence, options)` 按 `jdRelated` 过滤、每个条目至少留一条、按 `relevance` 降序截到 `maxCandidates`，返回候选要点与取舍记录（D1）。**共享包里不得出现 Node 内置 API**。验收：候选集里没有 `jdRelated === false` 的要点；每个有要点的条目至少留一条；候选条数 ≤ `maxCandidates`。[自动化验收]
- [ ] 1.2 `packages/shared/src/engines/coverage.ts` 抽出 `matchRequirement(draft, requirement, evidence)`，`computeCoverage` 改为逐条调用它；**规则路径产物逐字不变**（D3）。验收：重构前后 `computeCoverage` 的输出完全一致。[自动化验收]
- [ ] 1.3 新增 `packages/shared/src/engines/candidateSelection.spec.ts`：筛选口径、每条目至少一条、上限截断、`jdRelated` 过滤。验收：见 1.1。[自动化验收]
- [ ] 1.4 补 `packages/shared/src/engines/coverage.spec.ts` 的重构回归用例：同一份底稿与 JD，重构前后的分档逐字一致。验收：见 1.2。[自动化验收]

## 2. 共享包 · 比对路径（D2、D3）

- [ ] 2.1 `packages/shared/src/engines/jdAnalysisPrompt.ts`：`buildJdAnalysisPrompt` 改收候选要点（保留**全量原序号**，可跳号），提示词写明「编号是它在整份简历里的位置，中间被略过的是与该岗位无关的要点」；`PROMPT_VERSION` 升到 `llm-jd-analysis-v2`（D2）。验收：提示词里的编号是全量编号；提示词含跳号说明。[自动化验收]
- [ ] 2.2 `packages/shared/src/engines/jdAnalysis.ts`：接入候选筛选；模型回引的序号改为**按编号查候选表**而不是按数组下标取，候选集外的编号落回现有的越界分支（`outOfRange += 1`）并把该条要求按没有对应事实处理（D2）。验收：模型引用候选集外的编号时，该条要求不进 `coverage`，越界计数增加。[自动化验收]
- [ ] 2.3 `packages/shared/src/engines/jdAnalysis.ts`：新增复核——模型判 `none` 的要求用规则目录在**全部**要点上重判一次，匹配到的降为 `weak` + `approximate: true`，仍匹配不到的才算未覆盖（D3）。验收：落选的要点里能匹配到的要求变成弱覆盖且标注近似匹配；匹配不到的仍是未覆盖。[自动化验收]
- [ ] 2.4 `packages/shared/src/engines/jdAnalysis.ts`：`JdAnalysisResult` 增加 `bulletsSent` / `bulletsTotal`，`StoredJdAnalysisPayload` 增加同形状的可选字段 `call`（模型标识 / 提示词版本 / token 数 / 发出多少条）。验收：类型检查通过；结果里能读到发出与总的条数。[自动化验收]
- [ ] 2.5 补 `packages/shared/src/engines/jdAnalysis.spec.ts`：候选筛选接入、序号回查与越界丢弃、复核把未覆盖改回弱覆盖。验收：见 2.1–2.3。[自动化验收]
- [ ] 2.6 补 `packages/shared/src/engines/jdAnalysisPrompt.spec.ts`：候选只发候选、JD 全文照发、编号跳号保留。验收：见 2.1。[自动化验收]

## 3. 共享包 · 改写路径与生成经过（D4、D8、D9、D10）

- [ ] 3.1 `packages/shared/src/engines/llmPrompt.ts`：`buildRewritePrompt` 的要求只发**已覆盖**的（`tier` 为 `strong` 或 `weak`），`none` 不发；`PROMPT_VERSION` 升到 `llm-rewrite-v2`（D4）。验收：提示词里不含 `tier === 'none'` 的要求。[自动化验收]
- [ ] 3.2 `packages/shared/src/engines/generator.ts`：模型正文重新 `assembleBody` 后补 `assertCleanOutput(body, '版本正文')`，命中则整版回落规则产出并记原因（D8）。验收：模型正文含禁用词时 `integrity.generator === 'rules'` 且 `degradeReason` 非空。[自动化验收]
- [ ] 3.3 `packages/shared/src/engines/generator.ts`：`applyPatchedDiff` 给模型改写过的要点打 `writtenBy: 'model'`，其余为 `'rules'`；`domain/types.ts` 的 `DiffEntry` 加可选字段 `writtenBy`（D9）。验收：模型改过的要点 `writtenBy === 'model'`；规则改的为 `'rules'`。[自动化验收]
- [ ] 3.4 `packages/shared/src/domain/types.ts`：新增 `VersionExplain` / `ExplainBullet` / `ExplainRewrite` / `ExplainModelCall` / `ExplainPipeline` 类型，`ResumeVersion` 加可选字段 `explain?: VersionExplain`（D5、D10）。验收：类型检查通过。[自动化验收]
- [ ] 3.5 新增 `packages/shared/src/engines/explain.ts`：`buildExplain(...)` / `mergeRewriteExplain(...)` 纯函数，从 coverage / evidence / diff / claims / violations 组装面板数据；**不依赖 `degraded` 标志**（D9）。验收：面板里的每条事实都能追溯到 diff / claims / violations 中的一条。[自动化验收]
- [ ] 3.6 新增 `packages/shared/src/engines/explain.spec.ts`：取舍依据与改动对照条数一致、每条要点能指出命中了哪几条要求、模型路径记录两次调用、规则路径记录没有用模型。验收：见 3.5。[自动化验收]
- [ ] 3.7 补 `packages/shared/src/engines/llmPrompt.spec.ts` 与 `generator.spec.ts`：只发已覆盖的要求、禁用词复查、`writtenBy` 标记、explain 组装。验收：见 3.1–3.3。[自动化验收]

## 4. 服务端（设计 §7 B1–B4）

- [ ] 4.1 `server/src/llm/config.ts`：`LlmConfig` 加 `maxCandidateBullets`，`llmConfigFromEnv` 读 `LLM_MAX_CANDIDATE_BULLETS`（默认 40）；`server/src/index.ts` 把它装配进 `createLlmJdAnalyzer`（D1）。验收：改了环境变量能改候选上限；默认值 40。[自动化验收]
- [ ] 4.2 `server/src/routes/jd.ts`：`toResponse` 加 `scope`（`totalBullets` / `comparedBullets`）；`toStoredAnalysis` 带上 `call`。验收：响应里有 `scope`，两个数都存在。[自动化验收]
- [ ] 4.3 `server/src/routes/resume.ts`：版本详情与生成响应带 `explain`；**版本列表剥离 `explain` 键**（D5）。验收：列表每一项都没有 `explain`；详情响应里有 `explain`。[自动化验收]
- [ ] 4.4 `server/src/routes/engine.ts`：响应加 `timeoutMs`（`deps.llm?.timeoutMs ?? null`）（D7）。验收：配了供应商时有值，没配时为 null。[自动化验收]

## 5. 前端 · 数据与状态（设计 §7 C1–C2）

- [ ] 5.1 `frontend/src/api/resume.ts`：`JdAnalysisResponse` 加 `scope: { totalBullets: number; comparedBullets: number }`；`fetchEngineStatus` 返回类型加 `timeoutMs: number | null`。验收：类型检查通过。[自动化验收]
- [ ] 5.2 `frontend/src/api/client.ts`：加可选的客户端超时（`AbortSignal.timeout`），超时抛 `ApiError('UNKNOWN', FAILURE_STATES['llm-timeout'])`；**用户主动取消仍原样抛 `AbortError`**（D7）。验收：超时时抛出的 `ApiError` 状态是 `llm-timeout`。[自动化验收]
- [ ] 5.3 `packages/shared/src/domain/states.ts`：`EMPTY_STATES` 加 `no-generation-trace`（标题 / 说明 / 主动作三段齐全，占位符只用 `{value}`）。验收：`flows.spec.ts` 的状态表检查通过。[自动化验收]

## 6. 前端 · 界面（设计 §7 C3–C6）

- [ ] 6.1 新增 `frontend/src/components/VersionExplainPanel.vue`：四个区块（生成经过 / 模型调用 / 要点取舍 / 模型改写与换回）、要点条数超过 20 条时折叠 + 「展开全部 N 条」、「看改动对照」文字按钮、`explain` 缺失时显示 `no-generation-trace` 空态（设计 §2）。**只读、不新增设计变量、不写 px 字面量、不引入第二个实心主色**。验收：见 6.3。[自动化验收]
- [ ] 6.2 `frontend/src/views/VersionDetailView.vue`：加「这一版是怎么来的」页签并接入面板组件；页头动作区不新增动作。验收：页签存在；页头仍是一个实心主色 + 两个文字按钮。[自动化验收]
- [ ] 6.3 新增 `frontend/src/components/VersionExplainPanel.spec.ts` 与补 `frontend/src/views/VersionDetailView.spec.ts`：四个区块标题都在、没有 `explain` 时渲染空态、超过 20 条时默认只渲染 20 条且点「展开全部」后全部渲染、「看改动对照」切到改动对照页签。验收：见 6.1。[自动化验收]
- [ ] 6.4 `frontend/src/views/JdView.vue`：比对结果显示后加一行「这次比对了简历里的 N 条要点（共 M 条）」，说明其余没有参与比对的要点与这个岗位无关（澄清文档未决 5）。验收：界面上出现这行。[浏览器验收]
- [ ] 6.5 样式自查：新组件的样式全部走 `tokens.css` 的变量，不出现 px 刻度与视觉字面量；组件库按需自动导入，不写 `from 'element-plus'`。验收：`flows.spec.ts` 全绿。[自动化验收]

## 7. 文档（设计 §7 D1–D3）

- [ ] 7.1 `docs/api-contract.md`：加 `scope` / `explain` / `timeoutMs` 三个字段；说明版本列表里的版本不含 `explain`；把「客户端超时设 30 秒」那句改成「由 `GET /api/v1/engine` 下发的 `timeoutMs` 加一分钟余量决定」。验收：人工核对。[浏览器验收]
- [ ] 7.2 `docs/privacy-conclusions.md` §7：把「两件事发的是同一批内容」改写成「比对时发的是与该岗位相关的要点子集，改写时发的是进了这一版的要点与其子句；两次发出去的不是同一批，但都在同一份账号级同意的范围内」。验收：人工核对。[浏览器验收]
- [ ] 7.3 `server/.env.example`：说明 `LLM_MAX_CANDIDATE_BULLETS` 的含义与默认值，以及客户端超时与 `LLM_TIMEOUT_MS` 的关系。验收：人工核对。[浏览器验收]

## 8. 验收与归档（设计 §7 E1–E4）

- [ ] 8.1 `npm run verify`（仓库根，前端 + 服务端两端都跑）全绿。[自动化验收]
- [ ] 8.2 浏览器走黄金路径：解析 JD → 确认要求命中 → 生成版本 → 打开「这一版是怎么来的」→ 四个区块的数字与实际一致（要求条数、参与比对的要点数、进了这一版的要点数、模型改写条数、换回条数）。[浏览器验收]
- [ ] 8.3 浏览器走边界：打开改动之前生成的版本 → 面板显示空态、其余页签正常；375 / 800 两档不横向溢出；「展开全部 N 条」在 375 档可点。[浏览器验收]
- [ ] 8.4 浏览器核对「这一版是怎么来的」与「要求覆盖」「改动对照」「未覆盖要求」三个页签不打架，各说各的。[浏览器验收]
- [ ] 8.5 浏览器用一份真简历跑一遍模型路径，**肉眼核对模型引用的要点编号对不对得上原简历**（设计 D2 的最高风险项）。[浏览器验收]
- [ ] 8.6 归档：把三份 delta spec 同步进 `openspec/specs/`，并在 `openspec/specs/version-generation-trace/spec.md` **手工回填 `## Purpose`**（归档工具留下的占位符必须替换掉）。[自动化验收]
