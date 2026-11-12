## Why

点「解析 JD」之后，第二步那张「抽取到的要求与命中情况」**没有经过任何模型，也不是真的在比对**：

- 需求条目靠 `packages/shared/src/engines/jd.ts` 的正则与表头启发式切句。
- 命中情况靠 `packages/shared/src/engines/coverage.ts` 的 `computeCoverage`：把要求里的词与 `catalog.ts` 里一份**固定的技术词目录**的别名做包含匹配。
- 而这两步**跑在浏览器里**：`frontend/src/views/JdView.vue` 直接调 `useEngines()`。服务端 `server/src/routes/` 下**根本没有** `POST /api/v1/jd/analyze`——尽管 `docs/api-contract.md` 早就把它写进契约了。

结果是：目录里收录过的词才算命中，同义但没收录的写法一律判「未覆盖」；JD 里「负责中台业务系统的前端开发」这种**职责句**也会被当成一条岗位要求。用户看到的是一份关键词目录的产物，不是「这份 JD 要什么、我的简历有没有」的判断。

这一段要做的是把那张表换成**真的比对**：模型把 JD 里的岗位要求逐条抽出来，再逐条对照简历判断命中与否，并指出命中的是简历里的哪一条。

## What Changes

- **共享包新增 `engines/jdAnalysis.ts`**：`JdAnalyzer` 端口，`rules`（规则目录匹配）与 `llm`（模型比对）两个实现（ADR-0005 §2 的同构）。视图与状态层不感知实现差异。
- **共享包新增 `engines/jdAnalysisPrompt.ts`**：拼提示词与解析响应。**模型逐字引用 JD 原句、按要点序号回引**——不让它抄 id 哈希（抄错一位就查不出依据，而查不出依据等于没引用，沿用 `llmPrompt.ts` 已定的做法）。
- **模型输出不被信任**（ADR-0003 的口径）：要求必须能在 JD 原文中找到、序号必须指向真实要点、`strong` 必须有结果信号、规划性表述不算覆盖。任一条不成立就丢掉或降级。
- **提示词只发必要的内容**（`docs/privacy-conclusions.md` §4.3）：JD 全文 + 简历的分区/条目/要点正文，**不发姓名、电话、邮箱**。
- **同一份分析**（用户已定）：服务端按 `(用户, 简历修订号, JD 哈希, 模式)` 缓存分析结果。第二步看到的与版本详情里的是同一份，不会漂移；同一把键不会重复调模型、不重复计费（ADR-0005 §3「同输入缓存」）。
- **服务端新增 `routes/jd.ts`**：实现契约里早就预留的 `POST /api/v1/jd/analyze`。
- **版本生成复用同一份分析**：`POST /api/v1/versions` 按同一把键查缓存，命中就复用。
- **一个开关管两件事**：第二步的比对与第三步的改写共用「本次用模型」。开关移到「解析 JD」之前，否则点解析时它还没法生效。
- **账号级同意**（`docs/privacy-conclusions.md` §7 早就要求、代码里从未实现）：注册页单独勾选一次；勾过之后开关默认开，随时可关；没勾过的账号默认关。
- **界面只显示可核验的东西**：JD 原句、分档、命中的要点原文。模型的自由解释文本不进界面。
- **模型没调通时回落规则目录并标注**，界面上明说「本次按关键词匹配得到，命中情况仅供参考」，并给出回落原因。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `jd-version-generation`：覆盖程度分级改由模型逐条比对得出；未覆盖要求与第二步同源；模型不可用时的回落口径写清。
- `llm-engine`：「用户可以拒绝把简历发给模型」改写为账号级同意 + 默认开 + 随时可关；新增「模型比对结果逐条核对」。
- `account-access`：新增注册时的模型供应商同意与同意状态回传。

## Impact

- 新增文件：共享包 `engines/jdAnalysis.ts`、`engines/jdAnalysisPrompt.ts`、`engines/jdAnalysis.spec.ts`；服务端 `routes/jd.ts`、`routes/jd.spec.ts`。
- 改动文件：共享包 `engines/types.ts`、`engines/coverage.ts`、`engines/ordering.ts`、`engines/versionAssembly.ts`、`engines/generateVersion.ts`、`engines/generator.ts`、`domain/types.ts`、`domain/states.ts`；服务端 `routes/resume.ts`、`routes/auth.ts`、`db/schema.ts`、`db/store.ts`、`app.ts`、`index.ts`；前端 `api/resume.ts`、`stores/session.ts`、`stores/engines.ts`、`views/JdView.vue`、`views/VersionDetailView.vue`、`components/IdentityDialog.vue`、`views/JdView.spec.ts`。
- **落库结构变更**：`users` 加 `model_consent_at`；新增 `jd_analyses` 表。要加一条迁移。
- **规格口径变更**：`llm-engine` 的「默认不发」被改写。这是**有意的**——默认关是「没有账号级同意」时的兜底；有了 `privacy-conclusions.md` §7 要求的账号级同意之后，默认开 + 随时可关是完整形态。走 delta spec 落档，不靠代码里悄悄改默认值。
- **默认行为变化**：配了供应商且账号已同意时，第二步的比对与第三步的改写默认走模型；否则一律规则目录，界面标注。
- **依赖外部服务**：模型调用是外部依赖，测试用注入的假端口跑，不连真实供应商。
