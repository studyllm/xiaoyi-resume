# ADR-0004：引擎放哪

- **状态**：已接受
- **日期**：2026-11-04
- **相关变更**：`p3-backend-foundation`（P3 开工前的设计输入）

## 背景

解析、诊断、JD 解析与版本生成现在全部在浏览器进程内跑。`ADR-0001` 已经把 `VITE_ENGINE_MODE` 的取值域定成 `mock | remote` 两态，`remote` 一直空着——「预留而非可用」。

P3 要落真实存储，P4 要接 LLM。这两件事各自把问题推进一步：

- **P3**：数据在服务端，那么「算」在哪儿？前后端各算一份，还是只有服务端算？
- **P4**：LLM 只能在服务端调（密钥不能进浏览器包）。如果规则引擎在浏览器、模型在服务端，一次「生成版本」就要跨两个地方拼，错误处理与降级都变复杂。

三条冻结点都指向同一个方向：

- **F1**：`ResumeEngines` 五个方法现在全是同步返回值，服务端引擎必然异步。异步化**晚了要二次返工**——`draftStore.ingest`、`versionsStore.generate`、`ImportView`、`JdView` 全部是调用点。
- **F9**：共享包边界——`domain/` + `engines/` 前后端共享的引用方式与发布方式。**不冻结的后果是引擎在两端漂移**，「同一输入同一输出」只剩口头约定。
- **F10 第 3 项**：`jd-version-generation` 的「生成结果可复现」这条要求，在 LLM 引擎下要降级为「输出可审计」。

引擎本身是纯函数、无 DOM 依赖（`ResumeEngines` 的五个方法全部满足），这个前提现在成立，是能共享的原因。

## 决策

### 1. 引擎在服务端运行

`remote` 模式下，`ResumeEngines` 的五个方法——`parseDraft`、`diagnose`、`parseJd`、`evaluateJd`、`generateVersion`——全部由服务端执行，前端通过 HTTP 调用。

服务端不只是「存数据的 API」，它是**引擎宿主**。API 契约里既有资源端点，也有引擎端点。

### 2. 保留 mock 实现，不删

`VITE_ENGINE_MODE=mock` 时全部在本地跑。取值域与降级行为按 ADR-0001，不改：未知值静默回落到 `mock`。

mock 存在的三个理由：

- 演示与评审场景下不依赖服务端。
- 前端单测直接跑本地引擎，不需要起服务。
- 服务端不可用时前端仍能完成全部功能——这正是 ADR-0001「静默降级比中断用户流程更符合原型约束」的延续。

### 3. 共享包是同一份源码，不是发布的包

用 **npm workspaces**：

```
packages/shared     domain/ + engines/（除 pdfText.ts）
apps/frontend       Vue 应用
apps/server         Node 服务
```

frontend 与 server 引用 `packages/shared` 的**同一份源码**，同一份 lockfile。**没有发布流程，没有版本号对齐问题**——F9 想防的「两端漂移」在这里由工具链结构保证，不靠约定。

### 4. `pdfText.ts` 留在前端

PDF 提取用 pdf.js，是浏览器能力；而且 P1 对用户承诺过「文件在浏览器里解析，不会上传到任何服务器」。它**不在 `ResumeEngines` 接口里**，只被 `ImportView` 直接调用，因此不进共享包，也不影响共享包的边界。

### 5. 服务端是权威

客户端提交**原始文本**，服务端跑引擎、落库、返回结果。客户端不把算出来的结构直接当作可信数据提交。

服务端对收到的内容**重跑不变量校验**（版本正文里没有底稿之外的事实）。这条校验现在是前端的（`generateVersion` 内部），迁到服务端后成为一道服务端保证——呼应 P4 的 F4 校验器设计。

### 6. 五个方法全部异步

`ResumeEngines` 的方法签名全部改为返回 Promise，**mock 实现也返回已 resolve 的 Promise**。

理由：调用点只写一套 await 逻辑。否则 `mock` 与 `remote` 各要一套调用点写法，切换时必然漏改一处——而漏改的那处只在生产环境暴露。

## 何时重开这个决策

- **P4 接 LLM 时**：引擎会变成「远端模型 + 服务端规则」的混合。耗时特征、降级策略（模型不可拒答时回落到规则引擎）都与现在不同，`ResumeEngines` 可能要拆成两个接口。
- **若将来要在客户端做本地推理**（隐私考虑，比如「简历正文永不出本机」），整个架构要改——这是产品承诺级别的变更，不是技术选型。
- **若要支持离线编辑并与服务端合并**：这与「服务端是权威」有张力，需要另立 ADR 说清冲突时谁赢。

## 影响

- `frontend/src/engines/types.ts`：`ResumeEngines` 五个方法的签名全部改为 Promise。
- 调用点全部 await 化：`stores/draft.ts`、`stores/versions.ts`、`views/ImportView.vue`、`views/JdView.vue`。
- `stores/engines.ts` 的 `ENGINES` 表新增 `remote` 条目；`mockEngines` 保留但改为返回 Promise。
- 共享包抽取（T3.4）是本决策的结构保证，不做的话本 ADR 不成立。
- 服务端需要实现与 `mockEngines` **行为一致**的远端实现——「同一输入同一输出」由共享源码 + 同一份测试保证，不靠两套实现对齐。
