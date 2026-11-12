## Context

ADR-0004 把引擎放在服务端，ADR-0005 定死了模型接入形态：不做网关，规则引擎与模型做成同一个接口的两个实现，接口后面做生成日志、成本护栏、超时与重试、同输入缓存。

`docs/api-contract.md` §3 与 §4.4 早就把 `POST /api/v1/jd/analyze` 写进了契约（请求 `{ jdText }`，响应 `{ roleName, roleNameSource, warnings, coverage }`），但服务端一直没实现，前端于是自己在浏览器里跑规则引擎顶着。今天那张表是 `catalog.ts` 一份固定技术词目录的产物——不是比对。

这一段要做的是把那条端点补上，并让它背后是真的模型比对。同时要守住三条既有约束：模型的输出不被信任（ADR-0003）、简历内容发给第三方前有明示同意（`docs/privacy-conclusions.md` §4.3 与 §7）、密钥只在服务端。

## Goals / Non-Goals

**Goals**：第二步的「抽取到的要求与命中情况」由模型逐条比对得出；模型的每一条结论都能指回 JD 原文与简历里的真实要点；第二步与版本详情看到的是同一份分析；模型不可用时功能不中断，但界面明说那是粗判。

**Non-Goals**：不做模型网关、不做多供应商路由（ADR-0005 §1）；不追模型改写质量；不引入「每日次数与成本上限」（ADR-0005 §3 的第二道闸，另段做）；不改版本正文的重组与删减规则（那由 `generateVersion` 的规则路径继续负责）。

## Decisions

### D1. 端口在共享包，模型传输由服务端注入

共享包新增 `JdAnalyzer` 端口：

```ts
export interface JdAnalyzer {
  analyze(
    draft: Draft,
    jdText: string,
    ctx: EngineContext,
    options?: { useLlm?: boolean },
  ): Promise<JdAnalysisResult>
}
```

与 `ResumeGenerator` 同构：`rules` 实现包一层现有的 `parseJd` + `evaluateJd`，`llm` 实现注入 `ChatCompletion`（`server/src/llm/client.ts` 的 `createOpenAiChat`）。

**理由**：与 ADR-0005 D1 同一条理由——这是「密钥不进浏览器包」的结构保证，不是约定。前端 bundle 里根本没有能读到密钥的代码。

### D2. 模型只被允许做两件事，且两件事都可核对

模型返回：

```json
{"requirements":[{"quote":"熟悉 Docker 与 CI/CD 流程","tier":"strong","bullets":[3,7]}]}
```

**逐字引用 JD 原句**（`quote`），**按要点序号回引**（`bullets`，1..N）。

**理由**：这两件事正好是规则引擎做不到、又必须由语义判断的事。而「引用」这个动作必须可核对：

- `quote` 必须在 JD 原文中（规范化后）——否则这条要求是模型编的，丢掉。
- `bullets` 是序号不是 id——`llmPrompt.ts` 已经定过这条：让模型抄 16 位 factId 哈希，抄错一位就查不出依据，而查不出依据等于没引用。序号短、必须来自给定列表，抄错的概率低得多；真抄错了，引擎按「序号不存在」丢掉这条引用。

界面只显示**可核验的东西**：JD 原句、分档、命中的要点原文。模型的自由解释文本不进界面——那是幻觉面，而且要过禁用词与「底稿」闸（`flows.spec.ts` 会扫 `version.uncovered[].explanation`）。

### D3. 校验规则逐条写死

模型给的每一条结论，落地前逐条核对（ADR-0003 的口径）：

| 情况 | 处置 |
| --- | --- |
| `quote` 不在 JD 原文中 | 丢掉这条要求，记一条 warning |
| `quote` 含禁用词 | 丢掉这条要求 |
| `bullets` 序号越界 | 丢掉这条引用 |
| `tier` 是 `strong`/`weak` 但引用为空 | 判为 `none` |
| `tier` 是 `none` | 清空它的引用 |
| `tier` 是 `strong` 但引用的要点都没有结果信号 | 降为 `weak` |
| 引用的要点全是规划性表述（`isPlanned`） | 判 `none`，理由 `planned-only` |

「`strong` 需要结果信号」这条沿用规则引擎的既有口径（`coverage.ts` 的 `hasResultSignal`）——分档的含义在两条路径上必须一致，否则界面上的「强覆盖」在两种来源下不是同一件事。

**理由**：模型的职责边界是「抽要求 + 判命中」，不是「决定覆盖有多强」。强度由可核验的信号决定。

### D4. 岗位名不由模型给

`RoleNameSource` 是 `domain/types.ts` 里的枚举（`'explicit' | 'pattern' | 'first-line' | 'phrase' | 'fallback'`）。岗位名识别今天就是确定性的、能用的，交给模型只会多一个编造岗位名的机会。

**模型只负责「抽要求 + 判命中」**，岗位名与来源照旧由 `detectRoleName` 出。

（顺带修契约：`docs/api-contract.md` §4.4 的示例值 `"roleNameSource": "extracted"` 根本不是枚举成员。）

### D5. 同一份分析靠服务端按输入哈希缓存

要保证第二步看到的与版本详情里的是**同一份**结论，靠的是服务端缓存，**不是**客户端传 id：

- 缓存键 = `(userId, draftRevision, jdHash, mode)`。`mode` 是「用模型比对」还是「用规则目录」——换了开关就是另一次分析。
- `POST /api/v1/jd/analyze` 算完写一行 `jd_analyses`，同键再来直接返回那一行，**不重复调模型、不重复计费**。
- `POST /api/v1/versions` 按同一把键查：命中就复用那份分析，不命中（改了简历、换了开关、换了 JD）就按当前模式重算。

**理由**：这正是 ADR-0005 §3 列的四件事之一（「同输入缓存：同一份简历 + 同一份 JD 再生成一次时命中缓存直接返回」）。用输入哈希做键，而不是让客户端递一个它自己也能编的标识——后者把「这份分析是不是真的算过」的决定权交给了客户端。

缓存有 TTL 与每账号条数上限，避免无限增长。

### D6. 模型路径下，覆盖由幸存的引用决定

`generateVersion.ts` 现在自己调 `parseJd` → `collectEvidence` → `computeCoverage` 决定要点排序、删减与覆盖保护闸门。闸门（删掉要点后若某条要求的覆盖级别下降就回滚）靠的是**重算覆盖**。

模型路径下模型分档是静态的，**不可重算**。改为共享函数 `recomputeCoverageAfterRemoval`：一条要求的分档由幸存的引用决定——`strong` 需至少一条幸存的引用且带结果信号，`weak` 需至少一条幸存的引用，否则 `none`。

**规则路径逐字不变**：`GenerateOptions` 加可选的 `analysis`，不传就走今天的路径，产物一个字节都不差（现有 `generateVersion.spec.ts` / `generator.spec.ts` 一行不改就该全绿）。

模型路径的 `evidence` 由模型的「要求→要点」引用反推：被引用的要点 `jdRelated = true`，`relevance = 3 × 被引用的要求数 + (有结果信号 ? 2 : 0)`；没被引用的要点 `relevance = 0`，排到末尾——与规则路径「与 JD 无关的排末尾」语义一致。

### D7. 账号级同意先补上，默认开才站得住

`docs/privacy-conclusions.md` §7 早就写明「注册页单独勾选『我同意简历正文被发给境内模型供应商』」，但代码里从未实现（`routes/auth.ts` 的注册端点不收这个字段，`IdentityDialog.vue` 也没有勾选框）。§5.1 说「默认关闭是唯一『明示同意」的口径」。

要让「默认开启」站得住，得先把 §7 要求的那层同意补上：

- `users` 加 `model_consent_at`；注册请求带 `consent: true`，否则 `400 VALIDATION_FAILED`。
- 开关默认值 = 服务端配了供应商 **且** 账号已同意。
- **没勾过的账号默认关**；打开时弹一次确认，确认即补记同意（`POST /api/v1/me/model-consent`）。
- 演示账号是假数据，直接记为已同意。

**这与 `llm-engine` 规格的「默认不发」冲突**，是**有意的口径修改**：默认关是「没有账号级同意」时的兜底；有了 §7 要求��账号级同意之后，默认开 + 随时可关，是「告知 + 可拒绝」的完整形态。**必须走 delta spec 改写那条要求**，并在 `privacy-conclusions.md` §5.1 记下这次修订——不能在代码里悄悄改默认值。

### D8. 提示词只发必要的内容

`privacy-conclusions.md` §4.3 写死：发给模型供应商的是「与目标岗位相关的分区 + 该份 JD」，**不发整份简历，不发姓名、电话、邮箱**。

提示词输入 = JD 全文 + 简历的分区 / 条目（公司·职位）/ 要点正文，逐条编号。**`draft.profile` 整个不进提示词**（姓名、抬头、联系方式）。

### D9. 一个开关管两件事，放在「解析 JD」之前

第二步的比对与第三步的改写共用「本次用模型」。开关状态进两个端点的请求体（`options.useLlm`），缓存键里的 `mode` 就是它。

开关位置从「生成选项」卡移到 JD 卡里、「解析 JD」按钮之前——否则点解析时它还没法生效。

### D10. 抽不出要求是空状态，不是失败

模型抽不出一条要求时返回 `200` + 空要求列表 + warning，**不是 422**。

**理由**：`jd-version-generation` 规格要求这种情况展示空状态并给出继续的入口，而不是把它当成解析失败。

## Risks / Trade-offs

**[模型慢]** —— 比对要走一次模型，1-2 分钟量级。等待期显示已等待秒数，不显示假进度条。

**[模型会漂]** —— 同一把键只算一次并缓存，第二步与版本详情看到的是同一份；换键才重算。

**[提示词注入]** —— JD 是用户贴进来的，可能带「忽略以上要求」。缓解：模型只被允许「从 JD 里逐字摘句」和「指向给定序号」，摘出来的句子必须通过原文核对，指向越界的序号一律丢掉；模型的输出一律过禁用词闸。

**[模型挑不出要求]** —— 有些 JD 写得潦草，模型可能抽不出像样的要求条目。这时回落规则目录并标注，而不是给一张空表。

**[成本]** —— 每次新键一次模型调用（同一键不重复调）；`jd_analyses` 记 token 数与模型 id，便于算钱。

**[默认开的口径]** —— 靠 §7 要求的账号级同意撑着。这是本次对 `llm-engine` 规格的正式修改。

## Migration Plan

- `users` 加一列，新增 `jd_analyses` 表——一条迁移，先迁移再切流量（`docs/ops/runbook.md`）。
- 版本 payload 是 jsonb，新增的 `coverageEngine` / `coverageDegradeReason` 不需要迁移；老版本缺省按规则目录看。
- 没配供应商时，行为与今天一致（规则目录），只是界面多了标注。

## Open Questions

- 每日次数与成本上限：另段做（本段先让 `jd_analyses` 记全 token 数）。
- 灰度对比：另段做（本段的结果全部可复现地记在 `jd_analyses` 里，具备做对比的基础）。
