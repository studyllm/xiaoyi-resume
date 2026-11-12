## 1. 共享包：比对引擎

- [x] 1.1 `engines/types.ts`：加 `JdAnalysis` / `JdAnalysisResult` / `JdAnalyzer` 类型；`GenerateOptions` 加 `analysis?: JdAnalysis`；把 `BulletEvidence` 从 `coverage.ts` 移到这里断环（`coverage.ts` / `ordering.ts` / `generateVersion.ts` 改从这里导入）；另加 `StoredEvidence` / `StoredJdAnalysisPayload`（`Set`/`Map` 存不进 jsonb，落库前摊平）
- [x] 1.2 `engines/jdAnalysisPrompt.ts`：拼提示词（JD 全文 + 编号后的分区/条目/要点，**不含 profile**）、解析响应（抽 JSON、容错、序号映射回要点 id）
- [x] 1.3 `engines/jdAnalysis.ts`：`rules` 实现（包一层 `parseJd` + `evaluateJd`）；`llm` 实现（调模型 → 逐条校验 → 命中情况）；校验规则（原文核对、序号越界、`strong` 无结果信号降级、引用为空判 none、规划性表述判 none + planned-only、禁用词丢弃）；模型不可用时回落规则目录并带回落原因
- [x] 1.4 `engines/versionAssembly.ts`：加 `recomputeCoverageAfterRemoval`（模型路径的覆盖保护闸门：分档由幸存的引用决定）
- [x] 1.5 `engines/generateVersion.ts`：接受 `options.analysis`；模型路径用分析结果的 `jd` / `coverage` / `evidence`，闸门改用 `recomputeCoverageAfterRemoval`；**规则路径逐字不变**
- [x] 1.6 `engines/generator.ts`：`rulesGenerator` / `createLlmGenerator` 透传 `options.analysis`；改写提示词里的「这一版要覆盖的要求」用分析出来的要求列表
- [x] 1.7 `domain/types.ts`：`ResumeVersion` 加 `coverageEngine` / `coverageDegradeReason`（jsonb，无需迁移；老版本缺省按 `rules` 看）

## 2. 共享包：状态文案

- [x] 2.1 `domain/states.ts`：加「正在比对 JD 与简历」「正在按关键词匹配」（STATUS_STATES）与「本次按关键词匹配得到，命中情况仅供参考」（WARNING_STATES）三条文案；占位符只用 `{value}`

## 3. 服务端：存储与同意

- [x] 3.1 `db/schema.ts`：`users` 加 `model_consent_at`；新增 `jd_analyses` 表 + 唯一索引 `(user_id, draft_revision, jd_hash, mode)`
- [x] 3.2 迁移：新增 `0003_jd_analysis_and_model_consent.sql`，SQL 进版本库能手工审
- [x] 3.3 `db/store.ts`：补 `jd_analyses` 与 `model_consent_at` 的读写（**内存实现与 Postgres 实现行为一致**）
- [x] 3.4 `routes/auth.ts`：注册收 `consent`（不勾 → `400 VALIDATION_FAILED`）；`GET /api/v1/me` 回传 `modelConsentAt`；新增 `POST /api/v1/me/model-consent` 补记同意；演示账号直接记为已同意

## 4. 服务端：比对端点与版本生成

- [x] 4.1 `routes/jd.ts`：`POST /api/v1/jd/analyze`——需登录；无底稿 404；JD 为空 422；按 `(userId, draftRevision, jdHash, mode)` 查缓存，命中直接返回（**不重复调模型**），不命中则算一次并落库
- [x] 4.2 `routes/resume.ts`：`POST /api/v1/versions` 按同一把键查分析；命中就复用，不命中按当前模式重算
- [x] 4.3 `app.ts`：`AppDeps` 加 `analyzer`；**8 个 `buildApp` 调用点跟着改**
- [x] 4.4 `index.ts`：按 `llmConfigFromEnv()` 装配 `analyzer`（有供应商走模型实现，无则规则实现）
- [x] 4.5 **服务端自己查账号级同意**（`mayUseModel`）——不信客户端传来的 `useLlm` 开关：没同意过的账号即使传 `useLlm: true` 也走规则目录

## 5. 前端：真比对

- [x] 5.1 `api/resume.ts`：加 `analyzeJd(jdText, options)` 与 `recordModelConsent()`
- [x] 5.2 `stores/session.ts`：存 `modelConsentAt`，登录后与恢复时回填
- [x] 5.3 `stores/engines.ts`：前端不再调 `parseJd` / `evaluateJd`（JD 走后端了）
- [x] 5.4 `views/JdView.vue`：「解析 JD」改异步（先 `saveIfDirty()` 再调服务端）；等待期间显示已等待秒数；表格加「命中依据」列（`matchedBulletIds` → 简历要点原文）；回落时给标注；开关上移到「解析 JD」之前并管两件事；**新增按钮一律文字按钮**
- [x] 5.5 `views/VersionDetailView.vue`：覆盖与未覆盖清单改用分析结果；说明区补「这次覆盖判断由模型比对得出」或「按关键词目录粗判」
- [x] 5.6 `components/IdentityDialog.vue`：注册模式加同意勾选框（未勾不能注册）
- [x] 5.7 界面文案过禁用词与用词检查（不得出现「底稿」；失败类文案只从 `states.ts` 取）

## 6. 用例

- [x] 6.1 `engines/jdAnalysis.spec.ts`：原文核对不过 → 丢掉并记 warning；序号越界 → 丢掉引用；`strong` 无结果信号 → 降 `weak`；引用为空却判 `strong`/`weak` → `none`；引用全是规划性表述 → `none` + `planned-only`；要求含禁用词 → 丢掉；坏 JSON / 调用抛错 → 回落规则目录并带原因；提示词里没有姓名电话邮箱
- [x] 6.2 `recomputeCoverageAfterRemoval`：删掉唯一引用 → strong→none；删掉带结果信号那条 → strong→weak
- [x] 6.3 规则路径回归：`generateVersion.spec.ts` / `generator.spec.ts` / `jd.spec.ts` **逐字不变**
- [x] 6.4 `routes/jd.spec.ts`：未登录 401；无底稿 404；JD 为空 422；同一把键不重复调模型；`/versions` 用同一份分析；改了 JD → 另一次分析；**没同意过时客户端传 `useLlm` 也不走模型**
- [x] 6.5 `views/JdView.spec.ts`：点「解析 JD」调服务端并渲染要求与命中依据；回落时有标注；开关默认开（有供应商 + 已同意）
- [x] 6.6 `flows.spec.ts` 守卫不破

## 7. 文档

- [x] 7.1 `docs/api-contract.md`：§4.4 补齐请求与响应字段；修 `roleNameSource` 的非法示例值；说明 `/jd/analyze` 跑在已保存的简历上；§6 补「同键复用已算好的分析」；§9 补错误码与降级；§3 补两个新端点
- [x] 7.2 `docs/privacy-conclusions.md`：§5.1 记下这次的默认口径修订；§4.3 补「比对 JD 时发的是分区/条目/要点正文，不发 profile」；§3 补 `jd_analyses` 的保留期；§7 补同意覆盖的范围
- [x] 7.3 `docs/backend-stack.md` §5：加 `jd_analyses` 与 `users.model_consent_at`
- [x] 7.4 `docs/regression-cases.md`：补「真实比对 / 回落标注 / 两处一致 / 关掉开关不发内容」

## 8. 验收

- [x] 8.1 仓库根 `npm run verify` 全过（类型检查 → 全量测试 → 打乱顺序测试 → 构建；前端 + 服务端两端）
- [ ] 8.2 浏览器走一遍黄金路径：真比对 / 回落标注 / 关掉开关不发内容 / 版本详情与第二步一致 / 改简历后重算
- [ ] 8.3 归档：`/opsx:archive` 把 delta spec 合并回 `openspec/specs/`（本次不新建能力域，无需回填 `## Purpose`）

## 9. 顺带修的既有缺陷

- [x] 9.1 `frontend/src/flows.spec.ts` 用 `URL.pathname` 拼目录，在 Windows 上得到 `/D:/...` → 19 个守卫用例全部报错。改用 `fileURLToPath`
- [x] 9.2 `server/src/db/postgres.spec.ts` 同样的问题 → 真 Postgres 用例一条没跑。改用 `fileURLToPath`
- [x] 9.3 `server/scripts/dev.ts` 同样的问题，开发服务端起不来
- [x] 9.4 `frontend/scripts/verify.mjs` 在 Windows 上 spawn `.cmd` 抛 `spawn EINVAL` → **门禁根本跑不起来**。加 `shell: true`
