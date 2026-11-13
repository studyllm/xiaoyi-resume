# 生成 JD 定向版本：把黑盒拆开

- 重量：重
- 澄清文档：docs/clarifications/jd-generation-pipeline-clarity.md
- 系统设计：docs/designs/jd-generation-pipeline-clarity.md

## Why

澄清文档 §2.1–§2.3 指出：生成这一步在界面上是三步里最黑的一步——用户看不到这一版经过哪几步、模型看到了简历的哪一部分、哪些句子是模型写的、哪些被换回了；判定依据算出来了（相关度、命中关系、校验结论）却被丢掉；同时两次模型调用的提示词没有裁剪，整份简历原样发出去，成本与时延都被放大。

本变更按澄清文档 §3 的范围（A 提示词裁剪 / B 说明面板 / C 调用记录透出）与系统设计 `docs/designs/jd-generation-pipeline-clarity.md` 落地，核心不变式是系统设计 §1.1 的那一条：

> **裁剪只影响模型能看到什么，不影响系统能判定什么。**

模型判「未覆盖」的要求，系统用规则引擎在**全部**要点上复核一次（设计 D3），因此未覆盖清单不产生假阴性；候选要点**保留在整份简历中的原序号**（设计 D2），模型引用的号仍能对回原文，「查不出依据等于没引用」这条底线不破。

## What Changes

- **比对时只把候选要点发给模型**（设计 D1）：按规则引擎已有的相关度挑候选（`relevance > 0`、每个条目至少留一条、上限默认 40 且可配置），JD 全文照发。规则路径产物逐字不变。
- **候选要点保留原序号**（设计 D2）：提示词说明跳号含义；模型引用候选集外的序号时，该条要求按现有的越界逻辑丢掉，不错挂到别的要点上。
- **模型判「未覆盖」的要求在全部要点上复核**（设计 D3）：为此把 `computeCoverage` 拆出单条要求的匹配函数，规则路径产物保持逐字不变。
- **改写时只发已覆盖的要求**（设计 D4）：`strong` 与 `weak` 发给模型，`none` 不发；提示词版本升到 `llm-rewrite-v2`。
- **版本详情页新增「这一版是怎么来的」页签**（设计 §2）：四个区块——生成经过、模型调用、要点取舍、模型改写与换回。面板只读、不进打印稿、不引入新的设计变量。
- **面板数据在生成时写进版本 payload**（设计 D5）：`versions.payload` 增加可选键 `explain`，不动表结构、不写迁移 SQL；版本列表剥离 `explain`，详情保留。老版本没有这个键 → 显示空态「这一版生成时没有记录生成过程」。
- **比对范围对用户可见**（澄清文档未决 5）：`POST /api/v1/jd/analyze` 的响应增加 `scope`（共多少条要点、实际比对了多少条），生成页显示一行说明。
- **模型改写后的正文补禁用词复查**（设计 D8）：模型正文重新组装后过 `assertCleanOutput`，命中则整版回落规则产出并记原因——规格早已要求，只是没做到。
- **改动记录标出要点由谁写的**（设计 D9）：`DiffEntry` 增加可选字段 `writtenBy`，面板的事实全部从 `diff` / `claims` / `violations` 推导，不依赖语义有歧义的 `degraded` 标志。
- **客户端超时由服务端下发**（设计 D7）：`GET /api/v1/engine` 的响应增加 `timeoutMs`，前端按 `timeoutMs + 60s` 设客户端超时；超时提示写明「刷新版本列表看看，这次可能已经生成好了」，`Idempotency-Key` 保证重试不会生成第二份。

**不做**（澄清文档 §3「明确不做」）：不引入 SSE / 轮询；不合并两次模型调用；不引入新的相关性判定；不改 `degraded` / 回退的对外说法（另开 `fix-` 变更）；不做每日次数与成本上限。

## Capabilities

### New Capabilities

- `version-generation-trace`: 版本详情页的「这一版是怎么来的」说明面板——生成经过、模型调用、要点取舍、模型改写与换回四个区块；面板数据在生成时写进版本 payload，列表剥离、详情保留；老版本显示空态而不是空白。

### Modified Capabilities

- `jd-version-generation`: 「覆盖程度由模型逐条比对得出」增加一条不变式——裁剪后模型判未覆盖的要求必须在**全部**要点上复核，未覆盖清单不产生假阴性；比对的覆盖范围（`scope`）随结果一起给到界面。
- `llm-engine`: 「比对 JD 时只发必要的内容」收紧为只发候选要点子集且保留原序号；「模型比对结果逐条核对」增加复核环节；「每次生成可审计」的调用记录透出到界面；新增「客户端等待模型有上限，超时上限由服务端下发」。

## Impact

**规格**

- 新增 `openspec/specs/version-generation-trace/spec.md`（归档时合并进主 specs）。
- 改 `openspec/specs/jd-version-generation/spec.md`、`openspec/specs/llm-engine/spec.md`。
- **不新增错误码**：`packages/shared/src/contracts/error-codes.ts` 与 `docs/api-contract.md` §5 不动；客户端超时走前端已有的 `llm-timeout` 状态。

**共享包**（`packages/shared`，前后端引用同一份）

- 新增 `src/engines/candidateSelection.ts`（候选筛选）、`src/engines/explain.ts`（面板数据组装）及其用例。
- 改 `src/engines/jdAnalysis.ts`、`jdAnalysisPrompt.ts`、`llmPrompt.ts`、`generator.ts`、`coverage.ts`、`types.ts`；`src/domain/types.ts` 增加 `VersionExplain` 等类型与 `ResumeVersion.explain`、`DiffEntry.writtenBy`。

**服务端**

- `server/src/routes/jd.ts`（响应加 `scope`）、`resume.ts`（版本带 `explain`，列表剥离）、`engine.ts`（响应加 `timeoutMs`）。
- `server/src/llm/config.ts` 增加 `maxCandidateBullets`（`LLM_MAX_CANDIDATE_BULLETS`，默认 40）。
- `server/src/db/schema.ts` 不改，**不新增迁移**。

**前端**

- 新增 `frontend/src/components/VersionExplainPanel.vue`；改 `frontend/src/views/VersionDetailView.vue`（新页签）、`frontend/src/views/JdView.vue`（比对范围一行）、`frontend/src/api/client.ts`（客户端超时）、`frontend/src/api/resume.ts`（响应类型）、`packages/shared/src/domain/states.ts`（空态 `no-generation-trace`）。

**文档**

- `docs/api-contract.md`（三个新字段 + 「列表项不含 `explain`」+ 改写「客户端超时设 30 秒」那句）、`docs/privacy-conclusions.md` §7（两次调用发的不再是同一批内容）、`server/.env.example`。

**冻结点**

- F3（数据模型与 schema v1）：**形式上碰到，论证为不撞**——`versions.payload` 是 jsonb，新增的是可选键，旧行没有就是没有，不需要回填、不需要转换、不改列、不写迁移；前端取不到时按「这一版生成时没有记录生成过程」显示。这个判断需评审推翻的余地已写在设计 §1.3。
- F8（隐私口径）：**要改一句**——同意的范围不变（仍是简历正文 + 这份 JD），但两次调用发的内容不再相同，`docs/privacy-conclusions.md` §7 那句要改写。
- F1 / F2 / F4 / F5 / F6 / F7 / F9 / F10 不撞，逐条论证见设计 §1.3。
