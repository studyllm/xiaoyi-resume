# 项目地图 · 系统设计时查这里

> 这份文件是「某个东西该改在哪里、哪条规矩管着它」的索引。
> 设计时**照着这里查文件**，不要凭印象写路径。

## 1. 三层代码

| 层 | 位置 | 放什么 | 不放什么 |
| --- | --- | --- | --- |
| 共享包 | `packages/shared/src/` | 两端都要跑的纯逻辑：领域类型、引擎、契约 | 浏览器专属能力、服务端专属能力 |
| 前端 | `frontend/src/` | 视图、组件、状态、接口调用、样式 | 业务判定逻辑（该下沉到共享包） |
| 服务端 | `server/src/` | 路由、鉴权、存储、模型接入 | 界面逻辑 |

**共享包不是复制。** `packages/shared` 的文件被两端**引用同一份**。改动那里两端同时生效。

```
packages/shared/src/
  domain/     types.ts（Draft/ResumeVersion/Diagnosis/Jd/Fact/Claim…）
              states.ts（状态文案表，唯一来源）
              sectionFields.ts / links.ts / ids.ts / time.ts / breakpoints.ts
  engines/    parseDraft / diagnose / jd / jdAnalysis / generateVersion /
              generator（端口）/ editing（纯函数编辑）/ anchor（批注锚定）/
              ledger（事实账本）/ coverage / ordering / versionAssembly /
              markdown / forbidden（禁用词表）/ mockEngines（演示实现）
  contracts/  error-codes.ts（错误码表，两侧唯一来源）

frontend/src/
  api/        client.ts（fetch 封装、ApiError）、resume.ts（端点函数）
  stores/     session / draft / versions / ui / persistence / engines
  components/ ResumeEditor / PaperCanvas / PaperField / CommentSidebar /
              BulletComments / EmptyState / SidebarEmpty / DeleteButton /
              IdentityDialog / UnsavedChangesDialog / StructureFindingsPanel …
  views/      Welcome / Import / Draft / Diagnosis / Jd / Versions /
              VersionDetail / VersionPrint
  layouts/    DefaultLayout
  styles/     tokens.css（唯一允许写视觉字面量的文件）、main.css（全局工具类）
  router/     index.ts（路由与守卫）
  pdf/        pdf.js（浏览器专属，不进共享包）
  flows.spec.ts / repo-hygiene.spec.ts（两个守卫）

server/src/
  app.ts      buildApp（组装；AppDeps 注入 store/idempotency/mailer/generator/analyzer）
  routes/     auth / parse / import / resume / jd / engine / healthz
  db/         schema.ts（Drizzle 表）、store.ts（Store 接口 + 内存实现 + PG 实现）、
              migrate.ts（迁移链）、migrations/*.sql、idempotency.ts
  auth/       session.ts / mailer.ts / smtp.ts
  llm/        client.ts（createOpenAiChat）、config.ts（llmConfigFromEnv）
  http/       errors.ts（错误映射）、logger.ts
```

## 2. 改动落点速查

| 要改什么 | 落在哪 | 要不要写 design.md |
| --- | --- | --- |
| 解析、诊断、JD、版本生成的规则 | `packages/shared/src/engines/` | **要**（重） |
| 领域类型、状态文案 | `packages/shared/src/domain/` | **要**（重） |
| 接口、错误码、请求响应 | `server/src/routes/` + `docs/api-contract.md` | **要**（重） |
| 存储结构、迁移 | `server/src/db/schema.ts` + `migrations/` | **要**（重） |
| 界面布局、样式、颜色 | `frontend/src/styles/` + 组件样式 | 不要（轻） |
| 单页交互与文案 | `frontend/src/views/` | 不要（轻） |
| 单组件局部逻辑 | `frontend/src/components/` | 不要（轻） |

判据是「**改错了会怎样**」，不是改了多少行。拿不准就当重的写。

## 3. 架构硬约束（设计不能违反）

- **引擎可替换**：解析、诊断、JD 解析、版本生成通过 `ResumeEngines` 端口调用；JD 比对通过 `JdAnalyzer` 端口。规则与模型是同一接口的两个实现。视图与状态层不感知实现差异。
- **密钥不进浏览器包**：任何模型调用都在服务端。JD 比对与版本生成跑在服务端。
- **JD 比对跑服务端**：`POST /api/v1/jd/analyze`。
- **时间由调用方注入**：引擎通过 `EngineContext.now` 取时间，内部不读系统时间。
- **引擎输出可复现**：同一输入 → 同一输出；ID 由注入的 `IdSeed` 决定。
- **不编造**：版本生成只重组、删减、强调底稿中已存在的事实。材料不足时保持原样并说明哪些要求未覆盖。
- **模型的结论要核对**：模型给的要求必须能在 JD 原文中找到，命中的要点必须真实存在，强度不采信模型自评。
- **快照语义**：版本生成后独立保存，底稿后续修改不回写旧版本。
- **存档结构变更后**按迁移规则转换旧存档；迁移失败不白屏，丢弃该片数据并提示一次。
- **内容变更由纯函数算出**：调用方给出简历与一项操作，纯函数给出变更后的简历，不就地修改传入对象（`engines/editing.ts` 的 `applyOp` 是样板）。

## 4. 契约与错误码

- `docs/api-contract.md` 是**冻结的契约**。`/api/v1` 前缀，字段只能加、枚举只能加。
- **错误码由服务端给，文案由前端映射**：服务端只返回机器可读 `code`，文案只在 `packages/shared/src/domain/states.ts` 一处。
- 错误码表在 `packages/shared/src/contracts/error-codes.ts`，与 `docs/api-contract.md` §5、`states.ts` 三处**必须一一对应**（守卫断言）。
- 写操作要么天然幂等，要么带 `Idempotency-Key`（`POST /versions`、`/auth/register`、`/auth/login`、`/draft/import-local` 要；`/jd/analyze` 同输入天然幂等）。
- 所有时间由服务端给；客户端不传时间戳。
- 每个 `5xx` 带 `X-Request-Id`。

## 5. 冻结点（设计前逐条查）

来自 `docs/产品开发计划-v1.0.md` §11。撞上了要在设计里写清楚。

| 编号 | 冻结内容 |
| --- | --- |
| F1 | `ResumeEngines` 的异步化语义（服务端引擎必然异步） |
| F2 | 引擎模式开关口径（`VITE_ENGINE_MODE`） |
| F3 | 简历/版本数据模型与 schema v1，必须为 `facts`/`claims` 预留扩展位 |
| F4 | 事实账本/声明账本/校验器规范（判定口径由 ADR-0003 定死） |
| F5 | 账号标识语义（服务端签发的不可猜��� uuid） |
| F6 | 成功指标定义与埋点事件表（口径，埋点实现在 P5） |
| F7 | 错误码表与「用户可见文案 ↔ 错误码」映射 |
| F8 | 数据隐私口径的产品侧结论（`docs/privacy-conclusions.md`） |
| F9 | 共享包边界（同一仓库 npm workspace，已冻结落地） |
| F10 | 存量规格退役清单（`prototype-runtime` 离线要求、`account-access` 无密码要求等） |

## 6. 界面硬约束（UI 设计不能违反）

- **纸是承载形式**：编辑页、诊断页都是「一张纸 + 一栏侧栏」，导入页只有纸、没有侧栏。
- **纸面版式**：单栏经典简历形态——分区标题加粗带下划线、条目头两端对齐、要点悬挂缩进。**不做双栏、侧边色块、头像、图标**。
- **颜色只承担语义**：主色只用于可操作元素；严重度同时用可区分的标记，颜色不是唯一区分手段。
- **字体分层**：`--font-ui`（界面）/ `--font-paper`（纸面正文），不混用。
- **编辑态标记不得改变版式**：不新增行、不占版面。预览与打印稿不得出现任何底色、虚线、外圈标记。
- **按钮三层语义**：主操作（实心主色，一个界面至多一个）/ 次要动作（文字按钮）/ 破坏性操作（垃圾桶图标，淡色常显、悬停转警示色）。
- **按钮尺寸只跟动作区走**，跟语义无关（页面动作区 small、对话框 default、落地页 large）。
- **链接不是按钮**：链接悬停出下划线，按钮不出。
- **视觉字面量只允许出现在 `styles/tokens.css`**。其余文件一律用变量，**且 `font-size`/`border-radius`/`padding`/`margin`/`gap` 不许出现 px 字面量**（纸面用 pt 与 mm）。几何尺寸（width/height/top/border-width）不受此限。
- **改组件库样式要改变量，不要直接写 `color`**；覆盖用 `html` 前缀提高特异性。
- **界面文案不得出现「底稿」**（界面显示「我的简历」「多 JD 版本」）。禁用词：面试、笔试、八股、考点、题库、题目、刷题、真题、面经。
- **状态文案只从 `states.ts` 取**，占位符只用 `{value}` 一个名字，每条失败都要给出下一步。

## 7. 守卫测试会拦什么

`frontend/src/flows.spec.ts`（规范守卫）会失败的情形：

- 样式文件里出现视觉字面量（`tokens.css` 除外）
- 从 `element-plus` 根包导入
- 界面模板或引擎输出出现「底稿」或禁用词
- 版本正文出现底稿之外的数字或实体
- 动作区里的按钮不是 small 尺寸
- 动作区里出现第二个实心主色，或出现带边框的次要动作
- 动作区之外出现带边框的次要动作（对话框、顶栏、落地页除外）
- 一个界面上出现第二个实心主色（登录卡、导入页除外）
- 卡片内的行内动作没带 `:icon`
- 状态表条目为空 / 失败提示没给下一步 / 错误码表与状态表不一一对应
- 只有图标的按钮没带可访问名称

`frontend/src/repo-hygiene.spec.ts`（仓库卫生）：嵌套源码目录、`.env` 文件（只允许 `.env.example`）、生效规格缺 `## Purpose` 或缺需求与场景。

**设计时先对照这两张清单**，比事后被测试拦下来省事。

## 8. 测试落点

| 被测的东西 | 测试文件放哪 | 环境 |
| --- | --- | --- |
| 共享包纯函数与引擎 | `packages/shared/src/engines/Xxx.spec.ts` | node（默认） |
| 领域类型与工具 | `packages/shared/src/domain/Xxx.spec.ts` | node |
| 服务端端点与存储 | `server/src/routes/Xxx.spec.ts`、`server/src/db/*.spec.ts` | node |
| 组件行为 | `frontend/src/components/Xxx.spec.ts` | jsdom（首行 `// @vitest-environment jsdom`） |
| 视图行为 | `frontend/src/views/Xxx.spec.ts` | jsdom |
| 全流程与静态不变量 | `frontend/src/flows.spec.ts` | node |

规则：测试文件与被测文件同目录同名前缀；数据用文件内工厂函数构造，不共用跨文件夹具；测试名用中文描述**行为与预期**。

**颜色、悬停、版式、分页、打印稿测不到**——那些在浏览器里验收，不要写断言 CSS 字符串的用例。
