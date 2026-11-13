# 生成 JD 定向版本：把黑盒拆开 · 系统设计

- 日期：2026-11-13
- 输入澄清文档：docs/clarifications/jd-generation-pipeline-clarity.md
- 重量：重
- 涉及维度：架构 / UI / 前端 / 后端 / 数据库 / 测试（全部七维）

> **术语对照**：本文用「底稿」指代用户持续维护的唯一事实源（界面显示为「**我的简历**」），
> 用「版本」指代按某份 JD 生成的快照（界面导航显示为「**多 JD 版本**」，句子里简称「版本」）。

---

## 0. 需求回指

澄清文档「功能范围」逐条 → 本设计的落点。

| 澄清文档的范围 | 本设计落点 | 状态 |
| --- | --- | --- |
| A1 比对那次只发候选要点，保留原序号 | §1.1 数据流第 1 步、§1.2 D1/D2/D3、§3.3 A1–A3 | 覆盖 |
| A2 改写那次只发已覆盖的要求 | §1.1 数据流第 2 步、§1.2 D4、§3.3 A4 | 覆盖 |
| A3 不引入新的相关性判定 | §1.2 D1（复用 `collectEvidence` 的打分） | 覆盖 |
| B 版本详情页的「这一版是怎么来的」面板 | §2 UI 设计、§3.3 C1–C2 | 覆盖 |
| C 调用记录透出到面板 | §1.1 数据流、§1.2 D5、§5.1 explain 结构 | 覆盖 |
| 明确不做：SSE / 轮询 | §1.2 D7（只加客户端超时，不加推送） | 覆盖 |
| 明确不做：合并两次调用 | §1.1（两次调用保留） | 覆盖 |
| 明确不做：分批调用 | §1.2 D4 | 覆盖 |
| 明确不做：改降级 / 回退的对外说法 | §8 未决 1（另开 `fix-` 变更，本设计不覆盖） | 不覆盖，已说明 |
| 顺带补 `assertCleanOutput` 缺口 | §1.2 D8、§3.3 A6 | 覆盖 |
| 未决 2：候选要点的筛选口径 | §1.2 D1 给出做法与代价，§8 仍列为待产品确认 | 部分覆盖 |
| 未决 3：禁用词缺口是否本轮补 | §1.2 D8 —— 按「规格已有要求即修复」处理 | 覆盖 |
| 未决 4：每日次数与成本上限 | §8 未决 4 —— 本轮不做 | 不覆盖，已说明 |
| 未决 5：生成前要不要也交代一句 | §2.1 —— 在生成页加一行「这次会拿 N 条要点去比对」 | 覆盖（低成本） |

**澄清文档与现状核对**：逐条落点都能在现有代码里找到对应位置，没有「澄清文档写了但现状已经做了」的情况。

---

## 1. 架构设计

### 1.1 落点与数据流

**新增落点**：共享包新增一个文件 `packages/shared/src/engines/candidateSelection.ts`（候选要点筛选，纯函数）。
其余改动都落在既有文件里。

**模型路径的数据流（裁剪后）**：

```
浏览器 JdView
  │
  ├─ POST /api/v1/jd/analyze ──▶ server/src/routes/jd.ts
  │                              └─ JdAnalyzer 端口
  │                                 └─ createLlmJdAnalyzer.analyze
  │                                    1. parseJd(jdText)            ← 规则抽要求、拿关键词（CPU）
  │                                    2. collectEvidence(draft, jd)  ← 全部要点的相关度（CPU）
  │                                    3. selectCandidates(evidence)  ←【新】按相关度挑候选
  │                                    4. buildJdAnalysisPrompt({ jdText, candidates })
  │                                       ← JD 全文照发；要点只发候选；保留要点在整份简历里的原序号
  │                                    5. chat()  → 一次模型调用
  │                                    6. parseModelRequirements → verifyModelRequirements
  │                                       ← 要求逐字回查 JD；序号回查候选表；强覆盖要有结果信号
  │                                    7.【新】复核：模型判「未覆盖」的要求，
  │                                       用规则引擎在【全部】要点上再判一次（见 D3）
  │                                 └─ 落 jd_analyses（缓存键：用户 + 修订号 + JD 哈希 + 模式）
  │
  └─ POST /api/v1/versions ──▶ server/src/routes/resume.ts
                                 ├─ resolveAnalysis()  ← 命中上一步的缓存，不再调模型
                                 └─ ResumeGenerator 端口
                                    └─ createLlmGenerator.generate
                                       1. generateVersion(...) → 规则产出的基线版
                                          （删减、排序、覆盖、diff 全部照今天）
                                       2. flattenBullets → 只展平【进了这一版】的要点
                                       3. buildRewritePrompt({ role, coveredRequirements, bullets })
                                          ←【新】要求只发已覆盖的（强覆盖 + 弱覆盖）
                                       4. chat() → 一次模型调用
                                       5. parseRewrites → verifyClaim → 不过关的换回规则产出
                                       6. assembleBody →【新】assertCleanOutput 复查
                                       7.【新】组装 version.explain
                                 └─ 落 versions.payload（含 explain）+ generations（审计）

详情页：
  GET /api/v1/versions/:id → { version } → VersionDetailView → VersionExplainPanel
```

**规则路径不变**：`rulesJdAnalyzer` 与 `rulesGenerator` 的产物逐字不变——
候选筛选只发生在「模型要看什么」这一层，规则引擎自己始终看全部要点。

**贯穿全程的不变式**（本设计最重要的一条）：

> **裁剪只影响模型能看到什么，不影响系统能判定什么。**
>
> 规则引擎的判定始终基于全部要点；模型只对被裁剪后的候选做判断。
> 模型说「未覆盖」时，系统用规则引擎在全部要点上复核一次（D3），
> 因此「未覆盖要求清单」不会出现假阴性。

### 1.2 决策表

#### D1 · 候选要点怎么筛

| | |
| --- | --- |
| **选** | 共享包新增 `candidateSelection.ts`，纯函数 `selectCandidates(evidence, options)`。规则：**`relevance > 0` 的要点**，按 `relevance` 降序取前 `maxCandidates` 条；**每个条目至少保留一条**（条目内 `relevance` 最高的那条），避免整条项目对模型完全不可见。`maxCandidates` 默认 **40**，由环境变量 `LLM_MAX_CANDIDATE_BULLETS` 覆盖。 |
| **备选** | ① 按 `relevance > 0` 全取，不设上限 —— 简历大时提示词仍然膨胀，裁剪没兑现。② 按「只保留强相关 + 每条目一条」 —— 太狠，会丢掉模型唯一能看出语义相关的那批。③ 引入向量检索 —— 引入新依赖与新失败模式，与「不引入新的相关性判定」冲突。 |
| **为什么** | `collectEvidence` 的 `relevance` 已经是同一套规则路径在用的打分（`coverage.ts:77`）。复用它意味着**候选集与规则路径的排序、删减行为不会差太远**，用户看到的「哪条被选中」与「哪条被删掉」讲的是同一个故事。 |
| **代价** | ① 简历里与该岗位语义相关但关键词不沾边的要点可能落在候选外 —— D3 的复核机制就是为这个兜底。② 模型看到的简历是「不连续」的（跳号），提示词里必须说清楚。③ 40 这个数没有实测来源，**是需要产品确认的待定值**（§8 未决 2）；好处是它是配置项，改数不用改代码。 |

#### D2 · 序号怎么处理（**最承重的一条**）

| | |
| --- | --- |
| **选** | **保留要点在整份简历里的原序号**（跳号）。模型回引的序号仍然是全量编号，`bulletIdOf` 的查表逻辑不变，只是查表范围变成候选集。提示词里写明：「序号是它在整份简历中的位置，中间被略过的是与该岗位无关的要点」。 |
| **备选** | ① 重编 1..N 连续号 —— **模型引的号对不回原文**。`jdAnalysis.ts` 的 `bulletIdOf` 按全量编号查表，重编后会把「要点 7」错查到另一条要点上。这直接违反「查不出依据等于没引用」，会让事实校验的担保失效。② 重编 + 附一张序号映射表 —— 要让模型同时维护两套号，抄错的概率更高。③ 改用 bullet id —— 模型抄 16 位哈希错一位就查不出依据，`llmPrompt.ts` 的注释已经说过这个坑。 |
| **代价** | 跳号会让模型困惑。缓解：提示词明确说明跳号含义；模型引用了候选集外的序号时，**现有的越界逻辑直接丢掉那条要求**（`jdAnalysis.ts` 的 `outOfRange`），不会错挂到别的要点上。 |

#### D3 · 模型判「未覆盖」的要求怎么办（**正确性的关键**）

| | |
| --- | --- |
| **选** | 模型判 `none` 的要求，**用规则引擎在全部要点上再判一次**：规则也匹配不到 → 真的未覆盖；规则匹配到了 → 降为 `weak` + `approximate: true`，并记下「这条没给模型看，是按关键词目录匹配到的」。为此把 `coverage.ts` 的 `computeCoverage` 拆出一个单条要求的匹配函数 `matchRequirement`，`computeCoverage` 改为对每条要求调它。 |
| **备选** | ① 模型说不覆盖就不覆盖 —— **未覆盖清单会有假阴性**。用户在清单里看到「你的简历中没有对应事实」，而实际上简历里有、只是没给模型看。这是**对用户说谎**，规格里「材料不足以支撑 JD 中的某项要求时……说明哪些要求没有对应事实」的前提被破坏。② 候选集扩到全部要点 —— 裁剪白做了。③ 对模型判 `none` 的要求再调一次模型 —— 多一次调用，与「保持两次」冲突，且成本翻倍。 |
| **为什么** | 澄清文档 §4.4 风险 1 已经点出「覆盖结论会比全量时保守」。D3 把这个风险从「面板上写一句免责声明」升级为「系统层面不产生假阴性」——**代价是覆盖强度可能被高估为 weak**，但 weak 本来就标注了「按关键词近似匹配」，不撒谎。 |
| **代价** | ① 覆盖清单里会出现「弱覆盖 + 按关键词近似匹配」这种看起来比现在弱的条目。② 多一次 CPU 计算（微秒级）。③ `computeCoverage` 要重构，规则路径的产物必须逐字不变——这条由回归用例守住。 |

#### D4 · 改写那次发哪些要求

| | |
| --- | --- |
| **选** | 只发**已覆盖**的要求：`tier` 为 `strong` 与 `weak` 的。`tier=none` 的不发。 |
| **备选** | ① 全发 —— 浪费 token；未覆盖的要求在正文里本来就不写内容，还会诱导模型去「照顾」它（虽然有事实校验兜底）。② 只发 `strong` —— `weak` 的要求同样值得强调，丢掉就少了一档定向能力。 |
| **代价** | 模型看不到「这条要求你的简历里没有事实」这个信号，**对「要求很匹配但简历写得不明显」的要点可能改写得不够用力**。接受这个代价：事实校验兜底，且改写幅度本来就不是这个产品的主要卖点。 |

#### D5 · 面板数据存在哪

| | |
| --- | --- |
| **选** | 存在 `versions.payload` 里（jsonb），`ResumeVersion` 增加一个**可选**字段 `explain?: VersionExplain`。`GET /api/v1/versions/:id` 原样返回；`GET /api/v1/versions`（列表）在服务端**剥离 `explain` 键**。 |
| **备选** | ① 新增一列 `versions.explain jsonb` —— 列表天然不受影响，但要写 SQL 迁移、动 `schema.ts`，**形式上撞 F3**（schema v1 已冻结）。放 jsonb payload 里不需要迁移。② 详情页现算：运行时从 `jd_analyses` 查证据 —— `jd_analyses` 每账号只留 20 份（`routes/jd.ts:14`），老版本的面板会拿不到数据；从 `generations` 查同理，它的保留期比简历短。③ 不存，面板现算 —— 面板要显示的「模型改写与换回」在模型路径下**只有服务端算得出**（事实校验在服务端），现算等于把校验搬到浏览器，不成立。 |
| **为什么** | 放 payload 里，`explain` 与版本正文同生共死——版本是快照，面板描述的也必须是生成当刻的事实。 |
| **代价** | ① 列表要剥离一个键，契约里「列表项是完整版本」这句话要加一个例外（§4.1）。② `versions.payload` 变大（每条要点一行依据摘要）。③ **形式上动了 F3 冻结的 `ResumeVersion` 字段** —— 见 §1.3 的论证。 |

#### D6 · 面板放在哪

| | |
| --- | --- |
| **选** | 版本详情页新增一个页签「这一版是怎么来的」。 |
| **备选** | ① 塞进「版本说明」卡片 —— 那张卡片已经有两段说明 + 四项 `el-descriptions` + 一个告警条，再塞就挤爆了。② 抽屉 / 弹窗 —— 打断阅读，窄屏更难读。③ 单独的路由页 `/versions/:id/explain` —— 多一次跳转，用户会以为这里能编辑。 |
| **代价** | 页签从 5 个变 6 个。窄屏（375）下 `el-tabs` 横向滚动，可接受。 |

#### D7 · 客户端超时

| | |
| --- | --- |
| **选** | **加**。`GET /api/v1/engine` 的响应加一个 `timeoutMs` 字段（加字段，兼容），前端按 `timeoutMs + 60s` 设客户端超时；`available` 为假时用短默认值（规则路径是毫秒级的）。 |
| **备选** | ① 不加 —— **现状就是不加**：前端 `api/client.ts` 没有传 `signal`，Fastify 也没设 `requestTimeout`。一次模型调用挂 10 分钟，HTTP 请求就一直挂着；用户关掉页面，服务端的调用还在跑，token 照烧。② 硬编码 15 分钟 —— 与服务端配置脱节；服务端配 30 秒时用户白等 14 分钟。③ 用契约里写的 30 秒 —— **会把每一次真实的模型调用都掐掉**（实测一轮要 10 分钟）。 |
| **为什么** | `docs/api-contract.md` 已经承诺「客户端超时设 30 秒」，但实现里没有；这个数在模型调用要 10 分钟的前提下是错的。设计与契约对齐的做法是：**把超时值从服务端下发**，两边不再各写一个数。 |
| **代价** | ① `timeoutMs` 是部署细节——但它不是模型 id 也不是供应商地址，`engine.ts` 那条注释排除的是后两者。② 客户端超时仍早于服务端时，用户会看到超时提示，而服务端可能已经把版本建好了——**`Idempotency-Key` 保证用户重试不会生成第二份**，刷新详情页能看到那一版。这一点要写进超时提示文案。 |

#### D8 · 模型改写后的正文补禁用词检查

| | |
| --- | --- |
| **选** | 补。在 `createLlmGenerator` 里，模型正文换回并重新 `assembleBody` 之后，再过一次 `assertCleanOutput(body, '版本正文')`；命中就整版回落规则产出并记原因。 |
| **备选** | 不补 —— 规格（`AGENTS.md` §7「引擎输出交付前都要过禁用词检查」+ `llm-engine`「模型输出的每一条要求 SHALL 不含界面禁用词」）已经要求了，现在只是没做到。 |
| **代价** | 命中时整版降级。触发概率低（模型主动写进禁用词不常见），但代价是用户白等。**接受**——「不编造」与用词底线比一次生成的成功率重要。 |

#### D9 · `degraded` 语义矛盾

**本设计不覆盖。** 澄清文档 §3「明确不做」里排除了「改降级 / 回退的对外说法」。

但设计上必须做到一件事：**说明面板不依赖那个有歧义的 `degraded` 标志**。
面板的每条事实都从无歧义的来源推导——`diff[].change`（保留 / 改写 / 移除）、`diff[].placement`（是否移至末尾）、
`trace.claims`（哪些要点是模型写的）、`integrity.violations`（哪几条没通过校验、什么原因）。
这样无论那个矛盾怎么修，面板都是对的。

具体做法：给 `DiffEntry` 增加一个可选字段 `writtenBy?: 'model' | 'rules'`，
在 `applyPatchedDiff` 里给模型改写过的要点打上 `'model'`。这是**加字段**，
旧版本没有这个字段时按 `'rules'` 看（与 `integrity.generator` 的老版本兜底一致）。

#### D10 · 每日次数与成本上限

**本轮不做**（澄清文档未决 4）。裁剪把单次成本降下来了，但没有上限仍然可能失控。
记入 §8，留给产品决定是否单开一轮。

### 1.3 冻结点检查

| 冻结点 | 是否撞 | 说明 |
| --- | --- | --- |
| **F1** 引擎异步化语义 | ❌ 不撞 | 不引入 SSE / 轮询；引擎接口形态不动，仍是 `Promise` 返回。 |
| **F2** 引擎模式开关口径 | ❌ 不撞 | `VITE_ENGINE_MODE` 的取值域与降级行为不动。 |
| **F3** 数据模型与 schema v1 | ⚠️ **形式上碰到，论证为不撞** | 见下方论证。 |
| **F4** 事实账本 / 声明账本 / 校验器规范 | ❌ 不撞 | `Fact` / `Claim` / `verifyClaim` / 回退语义一字不改。 |
| **F5** 账号标识语义 | ❌ 不撞 | — |
| **F6** 指标口径 | ❌ 不撞 | `version_generated` 的属性与口径不变；`duration_ms` 的分布会变（变短），口径不变不需要留痕。 |
| **F7** 错误码表与状态映射 | ❌ 不撞 | **不新增错误码**。客户端超时走前端已有的 `llm-timeout` 状态；模型失败仍是降级、不是错误。 |
| **F8** 隐私口径 | ⚠️ **要改一句** | `docs/privacy-conclusions.md` §7 现在写「两件事发的是**同一批内容**（分区、条目、要点正文 + 那份 JD），所以一处同意即可」。裁剪后两次调用发的**不再相同**（比对发候选要点，改写发全部保留要点与已覆盖要求）。**同意的范围不变**（仍是简历正文 + 这份 JD），只是那句描述要改。见 §4.4。 |
| **F9** 共享包边界 | ❌ 不撞 | 新增的 `candidateSelection.ts` 在共享包里，前后端引同一份。 |
| **F10** 存量规格退役清单 | ❌ 不撞 | 不动 `prototype-runtime` / `account-access` 的退役项。 |

**F3 的论证**（这条要写进 proposal 与设计评审）：

F3 冻结的是 `Draft` / `ResumeVersion` 的**字段、序列化与迁移规则**，其危害写的是
「P4 要改已落库结构 → **数据迁移 + 客户端兼容双改**」。本设计的改动是：

| F3 担心的 | 本设计的实际情况 |
| --- | --- |
| 数据迁移 | **不需要**。`versions.payload` 是 jsonb，`explain` 是**新增的可选键**，旧行没有这个键就是没有，不需要回填、不需要转换。 |
| 客户端兼容双改 | **不需要**。前端读 `version.explain`，取不到时按「这一版生成时没有记录生成过程」显示——老版本天然走这个分支。 |
| 改 schema | `versions` 表的**列**一个没动；`schema.ts` 不改；不加列、不加索引、不写迁移 SQL。 |

**结论**：这是**向后兼容的扩展**，不是存档结构变更，因此不需要走 F3 的迁移流程。
但它确实动了 F3 冻结的 `ResumeVersion` 类型，所以**必须在 proposal 里显式说明并留痕**，
让评审能推翻这个判断。若评审认为仍算结构变更，备选方案是 D5 备选 ①（新增 jsonb 列 + 迁移），
代价是多一个 SQL 迁移文件与 `schema.ts` 改动。

---

## 2. UI 设计

### 2.1 页面结构与线框

版本详情页**不改版式**，只多一个页签。页签顺序：现有五个不动，新的放最后。

```
┌────────────────────────────────────────────────────────────────────┐
│ 版本名                                    [复制▾][导出PDF][返回列表] │  ← 页面动作区
├────────────────────────────────────────────────────────────────────┤
│ ℹ 本版本由模型生成，模型写的每一条断言都经过事实校验…                 │
├────────────────────────────────────────────────────────────────────┤
│ 版本说明                                                          │
│  这一版只对你简历中已有的事实做重组、删减与措辞规范化…                │
│  对应岗位 / 生成时的简历修订号 / 生成时间 / 引擎版本                  │
│  ⚠ 本次由模型生成，有 3 处没有采用模型的改写，已换回规则引擎的产出     │
├────────────────────────────────────────────────────────────────────┤
│ [简历预览][正文全文][要求覆盖(12)][改动对照(77)][未覆盖要求(3)][这一版是怎么来的] │
├────────────────────────────────────────────────────────────────────┤
│ ① 生成经过                                                        │
│   JD 全文 → 抽到 12 条要求 → 比对了 40 条要点（简历里共 77 条）        │
│   → 进了这一版 28 条 → 模型改写 22 条 → 校验 28 条 → 3 处换回规则产出 │
│                                                                    │
│ ② 模型调用                                                        │
│   比对  model-x · 提示词 llm-jd-analysis-v2                        │
│         发出 40 条要点 · 输入 8.2k token · 输出 1.1k token · 12 秒   │
│   改写  model-x · 提示词 llm-rewrite-v2                            │
│         发出 28 条要点 · 输入 11.4k token · 输出 3.6k token · 3 分 41 秒│
│                                                                    │
│ ③ 要点取舍                                                        │
│   分区 · 条目 · 要点 · 结果 · 依据 · 命中了哪几条要求                 │
│   （每行末尾一个「看改动对照」的链接）                                │
│                                                                    │
│ ④ 模型改写与换回                                                  │
│   要点 · 模型写的 · 最终采用的 · 换回原因                             │
│   （每行末尾一个「看改动对照」的链接）                                │
└────────────────────────────────────────────────────────────────────┘
```

**四个区块的分工**（**不与已有页签重复**）：

| 区块 | 回答什么 | 与已有页签的关系 |
| --- | --- | --- |
| ① 生成经过 | 这一版经过哪几步、每步多少条 | 新增。已有页签都是「结果」，没有「过程」。 |
| ② 模型调用 | 模型是谁、发了什么、贵不贵、多久 | 新增。`generations` 表里已有这些数据，只是没给用户看。 |
| ③ 要点取舍 | 每条要点进了还是没进、为什么 | 补充「改动对照」没有的**依据**（相关度、命中了哪些要求）；取舍的逐条正文在「改动对照」里。 |
| ④ 模型改写与换回 | 哪些句子是模型写的、哪几句被换回、为什么 | 补充「改动对照」分不出的**出处**——那里的 `change=改写` 分不清是模型写的还是规则引擎改的。 |

**生成页（`JdView`）也要交代一句**（澄清文档未决 5，低成本）：
「解析 JD」按钮下方，在比对结果出来后显示一行——
「这次比对了简历里的 40 条要点（共 77 条），其余 37 条与这个岗位无关，没有参与比对。」

### 2.2 交互态

- 面板是**只读的**——不引入任何可编辑块，因此不涉及「编辑标记不得改变版式」这条。
- 面板不是纸面，不进入打印稿：`VersionPrintView.vue` 不动。
- **老版本的面板**：旧版本的 `version.explain` 不存在 → 面板显示一个空态
  「这一版生成时没有记录生成过程」，并说明「重新生成一版就能看到完整的生成经过」。
  **不能白屏，也不能显示一片空白表格**。
- 表格里的要点原文用 `.text-muted` 次级色，长文本省略并允许换行，不截断到读不出来。
- 折叠：③ 和 ④ 两个区块默认展开（它们是这次的核心价值）。要点条数超过 20 条时，
  ③ 区块折叠成前 20 条 + 一个「展开全部 N 条」的文字按钮。

### 2.3 动作与按钮

这一屏新增的动作：

| 动作 | 位置 | 形态 | 说明 |
| --- | --- | --- | --- |
| 「看改动对照」 | ③ ④ 区块每行末尾 | 文字按钮（`el-button text`），size small | 跳到已有的「改动对照」页签 |
| 「展开全部 N 条」 | ③ 区块底部 | 文字按钮，size small | 折叠态时才有 |

**不变量自查**（`flows.spec.ts` 的「操作按钮的形态」那组会拦）：

- 页面动作区（页头那排）已有「复制」「导出 PDF」「返回列表」——本轮**不新增页头动作**。
  页头仍是：一个实心主色（导出 PDF）+ 两个文字按钮。✓
- 面板里的按钮都在**卡片内的行内动作**位置 → size small + 文字按钮。
  `flows.spec.ts` 的「卡片里的操作按钮都带图标」检查的是**图标型**按钮（`:icon`），
  文字按钮不受这条约束；本设计的两个新按钮都是文字按钮。✓
- 「展开全部」是文字按钮，不是实心主色 → 全屏实心主色仍然只有「导出 PDF」一个。✓
- 没有第二个实心主色。✓

### 2.4 状态与文案

面板的文案**全部是静态说明**，不是状态——它由 `states.ts` 管不到（状态表管的是失败、空态与警告）。

需要从 `states.ts` 取的只有两处：

| 场景 | 状态条目 | 用法 |
| --- | --- | --- |
| 老版本没有 `explain` | `EMPTY_STATES` 新增一条 `no-generation-trace` | 标题「这一版生成时没有记录生成过程」，说明「重新生成一版就能看到完整的生成经过」，主动作「重新生成一版」 |
| 客户端超时 | `FAILURE_STATES['llm-timeout']`（**已存在**，`states.ts:194`） | 标题「模型响应超时」，说明要补一句「刷新版本列表看看——这次可能已经生成好了」 |

**新增状态条目**：`no-generation-trace`（`EMPTY_STATES`）。三段齐全（标题 / 说明 / 主动作），
占位符只用 `{value}` 一个名字。

**界面上要出现的文案**（示例，供实现时照抄）：

- 「这一版经过这几步：」
- 「抽到 N 条要求」
- 「比对了 N 条要点（简历里共 M 条，其余 M−N 条与这个岗位无关，没有参与比对）」
- 「进了这一版 N 条要点」
- 「模型改写 N 条」
- 「N 处没有通过校验，换回规则引擎的产出」
- 「这次没有用模型，全部由规则引擎生成」
- 「模型改写后有 N 处没有通过校验，已换回规则引擎的产出」

**不出现**：「底稿」（用「简历」）、禁用词（面试、笔试、八股、考点、题库、题目、刷题、真题、面经）。

### 2.5 视觉落点（变量）

面板**不新增任何设计变量**，全部复用既有：

| 用途 | 变量 |
| --- | --- |
| 区块标题 | `var(--text-md)` |
| 说明文字 / 次级信息 | `var(--ink-500)`（或 `.text-muted`） |
| 区块间距 | `var(--space-md)` / `var(--space-lg)` |
| 卡片圆角 | `var(--radius-md)` |
| 表格 | `el-table` size `small`（与已有页签一致） |
| 标签 | `el-tag` effect `plain`（与已有页签一致） |

**不写 px 字面量**——`font-size` / `border-radius` / `padding` / `margin` / `gap` 一律走变量；
几何尺寸（`width` / `height` / `top` / `border-width`）不受限，但本设计不需要写死几何尺寸。

颜色语义沿用既有规则：覆盖程度用 `el-tag` 的 `success` / `warning` / `info`；
「已移除」用 `danger`；**颜色不是唯一区分手段**——每个标签都有文字。

### 2.6 用词与响应式

- 用词：「我的简历」「多 JD 版本」「版本」。面板里说「简历」而不是「底稿」。
- 禁用词：面板会展示 JD 原句与模型改写后的正文——**这两处都要过禁用词检查**。
  - JD 原句：模型抽的要求已经过 `findForbiddenWords`（`jdAnalysis.ts:274`）。
  - 模型改写后的正文：本轮补上 `assertCleanOutput`（D8）。
  - **面板自身是只读展示，不产生新文案**，所以不会引入禁用词。
- 响应式（四档，`domain/breakpoints.ts`）：
  - `wide`（1440）：③ 的表格五列并排。
  - `medium`（1024）：③ 的表格「命中了哪几条要求」列收窄。
  - `narrow`（800）：表格变纵向卡片式——要点原文一行、结果与依据各一行。
  - `compact`（375）：页签横向滚动；② 的模型调用两行变成四行（模型 / 提示词 / 发出多少 / token 与耗时）。
  - `too-small`：走既有的降级提示，本设计不新增。
- 无障碍：面板里的表格用 `el-table` 自带的语义；「看改动对照」是文字按钮，有可访问名称；
  折叠展开用 `el-button` 的文字标签说明状态（「展开全部 77 条」/「收起」）。

---

## 3. 前端设计

### 3.1 落点与状态归属

| 东西 | 放哪 | 判据 |
| --- | --- | --- |
| 面板组件 | `frontend/src/components/VersionExplainPanel.vue` | 纯展示 + 一个折叠状态，与其它组件同级，可复用 |
| 面板数据 | `version.explain` | **不新增 store**——数据随版本一起进 `versionStore`，面板只读 |
| 折叠状态 | 组件内 `ref` | 页面局部状态，不进 store |
| 接口调用 | 不变 | 面板不调接口；数据在版本详情里已经拿到了 |

**不新增 store、不新增路由、不新增 API 端点。**

### 3.2 数据流

```
versionsStore.versions  ──▶  VersionDetailView（version = byId(route.params.id)）
                                       │
                                       └──▶ VersionExplainPanel :explain="version.explain"
                                                 │
                                                 └──▶ 纯展示 + 内部折叠 ref
```

**组件不直接 fetch**，符合既有约定；`versionStore.restore()` 已经在应用启动时拉过列表。

### 3.3 文件级改动清单

| 文件 | 改什么 | 为什么 |
| --- | --- | --- |
| `packages/shared/src/domain/types.ts` | `ResumeVersion` 加 `explain?: VersionExplain`；新增 `VersionExplain` / `ExplainBullet` / `ExplainRewrite` / `ExplainModelCall` / `ExplainPipeline` 类型；`DiffEntry` 加 `writtenBy?: 'model' \| 'rules'` | D5、D9 的数据形状 |
| `packages/shared/src/engines/candidateSelection.ts` | **新增**。`selectCandidates(evidence, options)`：按 `relevance > 0` 过滤 → 按 `relevance` 降序 → 每个条目至少留一条 → 截到 `maxCandidates`。返回候选 + 「每个条目至少留一条」的取舍记录 | D1 |
| `packages/shared/src/engines/candidateSelection.spec.ts` | **新增**。筛选口径的单元测试 | D1 |
| `packages/shared/src/engines/jdAnalysisPrompt.ts` | `buildJdAnalysisPrompt` 改收候选要点（带**原序号**）；提示词说明跳号含义；`PROMPT_VERSION` 升到 `llm-jd-analysis-v2` | D2、A2 |
| `packages/shared/src/engines/jdAnalysisPrompt.spec.ts` | 提示词形状的用例（候选只发候选、序号跳号保留、JD 全文照发） | A2 |
| `packages/shared/src/engines/jdAnalysis.ts` | `createLlmJdAnalyzer.analyze` 里插入候选筛选；`verifyModelRequirements` 的序号回查改为查候选表（越界逻辑保留）；**新增 D3 复核**：模型判 `none` 的要求用规则在全部要点上重判；`JdAnalysisResult` 加 `bulletsSent` / `bulletsTotal` | A1、A3、D3 |
| `packages/shared/src/engines/jdAnalysis.spec.ts` | 候选筛选、序号回查、D3 复核的用例 | A1、A3 |
| `packages/shared/src/engines/coverage.ts` | 抽出 `matchRequirement(draft, requirement, evidence)`；`computeCoverage` 改为逐条调它（**产物逐字不变**） | D3 的前置重构 |
| `packages/shared/src/engines/coverage.spec.ts` | 重构后的回归用例：规则路径产物与重构前逐字一致 | D3 |
| `packages/shared/src/engines/llmPrompt.ts` | `buildRewritePrompt` 的 `requirements` 改为**已覆盖的要求**；`PROMPT_VERSION` 升到 `llm-rewrite-v2` | D4 |
| `packages/shared/src/engines/llmPrompt.spec.ts` | 只发已覆盖要求的用例 | A4 |
| `packages/shared/src/engines/generator.ts` | 模型正文重新 `assembleBody` 后补 `assertCleanOutput`；`applyPatchedDiff` 给模型改写过的要点打 `writtenBy: 'model'`；组装 `version.explain` | D8、D9、A6 |
| `packages/shared/src/engines/generator.spec.ts` | 禁用词复查、`writtenBy`、explain 组装的用例 | A6 |
| `packages/shared/src/engines/explain.ts` | **新增**。`buildExplain(...)` / `mergeRewriteExplain(...)`：纯函数，从 coverage / evidence / diff / claims 组装面板数据 | B、C |
| `packages/shared/src/engines/explain.spec.ts` | **新增**。组装逻辑的单元测试 | B、C |
| `packages/shared/src/engines/types.ts` | `JdAnalysis` 加 `call?: JdAnalysisCall`（模型标识 / 提示词版本 / token 数 / 发出多少条要点）；`StoredJdAnalysisPayload` 加同形状的可选字段 | C |
| `frontend/src/api/client.ts` | 加客户端超时（`AbortSignal.timeout`）；超时抛 `ApiError` 带 `llm-timeout` 状态 | D7 |
| `frontend/src/api/resume.ts` | `JdAnalysisResponse` 加 `scope: { totalBullets: number; comparedBullets: number }`；`fetchEngineStatus` 返回类型加 `timeoutMs: number \| null` | B |
| `frontend/src/components/VersionExplainPanel.vue` | **新增**。四个区块 + 折叠 + 空态 | B |
| `frontend/src/components/VersionExplainPanel.spec.ts` | **新增**。组件行为用例（jsdom） | C |
| `frontend/src/views/VersionDetailView.vue` | 加「这一版是怎么来的」页签；引入面板组件 | B |
| `frontend/src/views/VersionDetailView.spec.ts` | 页签与空态的用例（jsdom） | C |
| `frontend/src/views/JdView.vue` | 比对结果显示后加一行「这次比对了 N 条要点（共 M 条）」 | 未决 5 |
| `packages/shared/src/domain/states.ts` | `EMPTY_STATES` 加 `no-generation-trace` | §2.4 |
| `docs/api-contract.md` | 见 §4.1 的字段清单；改写「客户端超时设 30 秒」那句 | D7 |
| `docs/privacy-conclusions.md` | 改写 §7「两件事发的是同一批内容」那句 | F8 |
| `server/src/routes/jd.ts` | `toResponse` 加 `scope`；`toStoredAnalysis` 带上 `call` | B、C |
| `server/src/routes/resume.ts` | 版本响应带 `explain`；**列表剥离 `explain`** | D5 |
| `server/src/routes/engine.ts` | 响应加 `timeoutMs` | D7 |
| `server/src/llm/config.ts` | 加 `maxCandidateBullets`（`LLM_MAX_CANDIDATE_BULLETS`，默认 40） | D1 |
| `server/.env.example` | 说明新的环境变量与实测含义 | D1、D7 |

---

## 4. 后端设计

### 4.1 端点表

**没有新端点。** 全部是对现有端点的**加字段**（`docs/api-contract.md`：「字段只能加、枚举只能加」）。

| 方法 | 路径 | 鉴权 | 幂等 | 请求 | 响应 | 失败码 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/jd/analyze` | 是 | **同输入天然幂等**（用户 + 修订号 + JD 哈希 + 模式） | `{ jdText, options: { useLlm } }` | `200 { analysisId, roleName, roleNameSource, requirements, coverage, warnings, engine, degraded, degradeReason, **scope** }` | `AUTH_REQUIRED` / `JD_EMPTY` / `RESUME_NOT_FOUND` |
| `POST` | `/api/v1/versions` | 是 | `Idempotency-Key` | `{ jdText, name, options: { allowVerbFronting, dropIrrelevantProjects, useLlm } }` | `201 { version }` —— `version` 里**新增** `explain` | `AUTH_REQUIRED` / `JD_EMPTY` / `RESUME_NOT_FOUND` / `GENERATION_FAILED` |
| `GET` | `/api/v1/versions` | 是 | 天然幂等 | `?page&pageSize` | `200 { items, page, pageSize, total }` —— **items 里的版本不含 `explain`** | `AUTH_REQUIRED` |
| `GET` | `/api/v1/versions/:id` | 是 | 天然幂等 | — | `200 { version }` —— 含 `explain` | `AUTH_REQUIRED` / `VERSION_NOT_FOUND` |
| `GET` | `/api/v1/engine` | 否 | 天然幂等 | — | `200 { available, **timeoutMs** }` | — |

**`scope` 的形状**：

```json
"scope": { "totalBullets": 77, "comparedBullets": 40 }
```

**`explain` 的形状**：

```json
"explain": {
  "pipeline": {
    "requirementCount": 12,
    "totalBullets": 77,
    "comparedBullets": 40,
    "keptBullets": 28,
    "modelRewritten": 22,
    "reverted": 3,
    "checked": 28
  },
  "bullets": [
    {
      "bulletId": "b-17",
      "sectionKind": "experience",
      "sectionTitle": "工作经历",
      "itemLabel": "某公司 · 前端工程师",
      "outcome": "kept",
      "reason": "与简历一致，原样保留",
      "relevance": 7,
      "matchedRequirements": ["熟悉 React 与 TypeScript"],
      "writtenBy": "model"
    }
  ],
  "rewrites": [
    {
      "bulletId": "b-17",
      "modelText": "……",
      "finalText": "……",
      "rejectedKind": "number-mismatch",
      "rejectedReason": "……"
    }
  ],
  "model": {
    "calls": [
      { "stage": "analyze", "model": "…", "promptVersion": "llm-jd-analysis-v2",
        "bulletsSent": 40, "promptTokens": 8200, "completionTokens": 1100,
        "degraded": false, "degradeReason": null },
      { "stage": "rewrite", "model": "…", "promptVersion": "llm-rewrite-v2",
        "bulletsSent": 28, "promptTokens": 11400, "completionTokens": 3600,
        "degraded": false, "degradeReason": null }
    ]
  }
}
```

**`explain` 的兼容规则**：

- 字段全部可选或带缺省；`version.explain` 整体是可选的。
- 老版本（改动前生成的）没有 `explain` → 前端显示空态「这一版生成时没有记录生成过程」。
- 规则路径生成的版本**也有** `explain`（模型调用那节显示「这次没有用模型，全部由规则引擎生成」）——
  说明面板不能因为「没用模型」就消失。

**契约文档要改的两处**：

1. 「列表项是**完整版本**」→ 加一句「列表里的版本不含「生成经过」明细（`explain`），要看明细打开详情页」。
2. 「生成可能耗时（P4 接模型后十秒级），客户端超时设 **30 秒**」→ 改成
   「生成可能耗时（接模型后实测分钟级，见 `server/.env.example`），客户端超时由 `GET /api/v1/engine`
   下发的 `timeoutMs` 加一分钟余量决定」。

### 4.2 错误码与状态

**不新增错误码。** 三处对应关系不动：

- `packages/shared/src/contracts/error-codes.ts` —— 不改。
- `docs/api-contract.md` §5 —— 不改。
- `packages/shared/src/domain/states.ts` —— 只**加一条空态** `no-generation-trace`（不属于错误码表）。

**模型失败仍然是降级，不是错误**：`POST /api/v1/versions` 继续返回 `201`，
`version.integrity.degraded` 为真、`degradeReason` 说清原因。理由与今天一致——
用户要的是一份能投的简历。

**客户端超时**：不是服务端返回的码，是前端自己判断的——`fetch` 抛 `AbortError` →
前端抛 `ApiError('UNKNOWN', FAILURE_STATES['llm-timeout'])`。
`llm-timeout` 这条状态**已存在**（`states.ts:194`），且已带 `code: 'LLM_TIMEOUT'`。

**「还没开始」与「做了但为空」要分开说**：
- 老版本没有生成过程 → **空态**（`no-generation-trace`），不是失败。
- 客户端超时 → **失败态**（`llm-timeout`），有下一步（「刷新版本列表看看，这次可能已经生成好了」）。

### 4.3 幂等与降级

| 端点 | 幂等方式 | 说明 |
| --- | --- | --- |
| `POST /api/v1/jd/analyze` | 同输入天然幂等 | 缓存键（用户、修订号、JD 哈希、模式）。**新增的裁剪参数不在缓存键里**——改了 `LLM_MAX_CANDIDATE_BULLETS` 之后，旧的缓存分析仍按旧口径返回。已知局限，记入 §8。 |
| `POST /api/v1/versions` | `Idempotency-Key` | 前端每次生成带 `crypto.randomUUID()`；服务端 `idempotency.recall` 命中就返回第一次的结果。**客户端超时后用户重试不会生成第二份**——这是 D7 里「超时后刷新能看到那一版」的前提。 |
| `GET /api/v1/engine` | 天然幂等 | — |

**降级矩阵**（逐条写明「回落还是 5xx」）：

| 失败 | 现在的行为 | 本轮 |
| --- | --- | --- |
| 模型超时 | 整版回落规则引擎 + `degraded` + 原因 | 不变 |
| 模型返回坏 JSON | 整版回落 + 原因 | 不变 |
| 模型写的正文有禁用词 | —— | **新增**：整版回落 + 原因（D8） |
| 服务端没配供应商 | 走规则路径 | 不变 |
| 模型写的要点没通过事实校验 | **单条**换回规则产出，整版仍算模型生成 | 不变 |
| 客户端超时 | —— | **新增**：前端提示 + 提示用户刷新看是否已生成（D7） |

**最后一条要特别小心**：`integrity.generator` 的取值是 `'llm' | 'rules'`，
「单条换回」时 `generator` 仍是 `'llm'`。D9 的矛盾正在这里——本轮**不动它**，
但面板不依赖它（§1.2 D9）。

### 4.4 装配改动

| 文件 | 改什么 |
| --- | --- |
| `server/src/llm/config.ts` | `LlmConfig` 加 `maxCandidateBullets`；`llmConfigFromEnv` 读 `LLM_MAX_CANDIDATE_BULLETS`（默认 40） |
| `server/src/index.ts` | 把 `llm.maxCandidateBullets` 传进 `createLlmJdAnalyzer`；`createOpenAiChat` 保持不变 |
| `server/src/routes/engine.ts` | 响应加 `timeoutMs`（`deps.llm?.timeoutMs ?? null`） |
| `server/src/routes/jd.ts` | `toResponse` 加 `scope`；`toStoredAnalysis` 带上 `call`（模型标识 / 提示词版本 / token / 发出多少条） |
| `server/src/routes/resume.ts` | 列表剥离 `explain`；详情与生成响应保留 |
| `server/src/app.ts` | `AppDeps` 不变（`analyzer` 与 `generator` 端口形状不变） |
| `server/src/db/schema.ts` | **不改** |
| `server/src/db/migrations/` | **不新增** |

**可观测**：

- `X-Request-Id` 照旧贯穿（`app.ts` 的 `onRequest` / `onResponse` 钩子）。
- 日志**不记录简历正文**——`generations` 表的输入用引用（`draft_revision` + `jd_hash`），
  新加的 `explain` 不进日志，只进版本 payload。
- `generations` 表新增两列？**不新增**——`promptTokens` / `completionTokens` / `model` /
  `promptVersion` 已经有了（`routes/resume.ts:167`）。**但 `bulletsSent` 没有对应列**，
  它的来源是 `explain` 里的 `model.calls[].bulletsSent`，不另建列。

**隐私（F8）**：

- **发出去的内容变少了**，没变多。同意的范围不变（简历正文 + 这份 JD）。
- `docs/privacy-conclusions.md` §7「两件事发的是同一批内容」那句要改写成：
  「两件事都会把简历正文的一部分发给模型供应商——比对时发的是与该岗位相关的要点子集，
  改写时发的是进了这一版的要点与其子句。两次发出去的**不是同一批**，但都在同一份账号级同意的范围内。」
- 姓名、抬头、联系方式**仍然不发**（`toPromptBullets` 只取分区、条目与要点正文）——这条不变。

---

## 5. 数据库设计

### 5.1 表结构变更

**没有表结构变更。** `server/src/db/schema.ts` 一个字不改，不新增迁移文件。

`versions.payload`（jsonb）里多一个键：

```ts
export interface ResumeVersion {
  // …现有字段不动…
  /**
   * 这一版是怎么来的。
   *
   * **可选**：改动前生成的版本没有这个键，界面显示「这一版生成时没有记录生成过程」。
   */
  explain?: VersionExplain
}
```

`VersionExplain` 的形状见 §4.1。

### 5.2 索引与约束

不动。`jd_analyses` 的唯一索引 `jd_analyses_key_idx`（用户 + 修订号 + JD 哈希 + 模式）
保证「同一把键只算一次」——本轮不变。

⚠️ **已知局限**：裁剪参数 `maxCandidateBullets` **不在缓存键里**。
改了配置之后，同一份 JD 的旧缓存分析仍按旧口径返回（面板显示的 `comparedBullets` 是当时的真值）。
解法要么把参数并进缓存键（要改唯一索引 → 迁移），要么运营上改配置后清缓存。**本轮按后者**（记入 §8）。

### 5.3 迁移与兼容

| 场景 | 处理 |
| --- | --- |
| 改动前生成的版本 | `version.explain` 为 `undefined` → 界面显示空态 `no-generation-trace`。**不回填**——回填要重跑模型，成本与隐私都不划算。 |
| 改动前缓存的比对分析 | `jd_analyses.payload` 里没有新的 `call` 字段 → 按缺省处理（模型标识与 token 数为空）。旧缓存会被 `pruneJdAnalyses`（每账号 20 份）自然淘汰。 |
| 数据库结构 | 不变，**不需要迁移 SQL**。 |
| 存档结构变更规则 | 见 §1.3 的 F3 论证——向后兼容的扩展，不走迁移流程，但要在 proposal 里显式留痕。 |

### 5.4 保留期与隐私

| 数据 | 在哪 | 留多久 | 谁来删 |
| --- | --- | --- | --- |
| `explain`（含要点原文与要求原文） | `versions.payload` | **与版本正文同长**——版本本身留多久它就留多久 | 账号注销时随版本一起删（`versions.user_id` 外键 `onDelete: 'cascade'`） |
| 模型调用记录（模型标识、提示词版本、token 数） | `explain.model.calls` + `generations` 表 | `generations` 的保留期比简历短（`ADR-0005` §5） | 按 P5 的 `docs/data-retention.md` |
| 要点的相关度与命中关系 | `explain.bullets` | 同 `versions.payload` | 同上 |

**存不存简历正文**：`explain.bullets[].reason` 是**判定理由**（人话，如「条目内要点过多，按相关度移出了这一版」），
`matchedRequirements` 是 **JD 原句**，`explain` **不复制整份简历正文**——
它引用的是要点 id 与文本片段，量级远小于正文，且**本来就存在于 `version.diff` 与 `version.coverage` 里**
（`diff[].fromText` 就是原文）。**没有新增一类敏感数据。**

**发给模型的内容**：变少，没变多。见 §4.4 隐私段。

---

## 6. 测试设计

### 6.1 用例矩阵

| # | 用例名（中文，描述行为与预期） | 断言点 | 验收方式 |
| --- | --- | --- | --- |
| T1 | 候选筛选只留下与该岗位相关的要点 | `selectCandidates` 的返回值里没有 `relevance === 0` 的要点 | 自动化（node） |
| T2 | 每个条目至少留一条要点 | 候选集覆盖了每个有要点条目的至少一条 | 自动化（node） |
| T3 | 候选数不超过上限 | 候选条数 ≤ `maxCandidates` | 自动化（node） |
| T4 | 比对提示词只发候选要点 | 提示词里出现的要点数 = 候选数，且不含落选要点 | 自动化（node） |
| T5 | 比对提示词仍照发 JD 全文 | 提示词包含 JD 原文 | 自动化（node） |
| T6 | 候选要点保留原序号 | 提示词里的序号是全量编号（可跳号） | 自动化（node） |
| T7 | 模型引用候选集外的序号时那条要求被丢掉 | `verifyModelRequirements` 的 `outOfRange` 计数 > 0，且该要求不进 `coverage` | 自动化（node） |
| T8 | 模型判未覆盖的要求在全部要点上复核后仍可能变成弱覆盖 | 规则在落选要点里匹配到时，该要求 `tier='weak'` 且 `approximate=true` | 自动化（node） |
| T9 | 复核后仍匹配不到的要求算未覆盖 | `tier='none'` | 自动化（node） |
| T10 | 规则路径的分档结果在重构前后逐字一致 | `computeCoverage` 重构前后输出相同 | 自动化（node） |
| T11 | 改写提示词只发已覆盖的要求 | 提示词里不含 `tier='none'` 的要求 | 自动化（node） |
| T12 | 改写提示词仍发全部保留要点及其子句 | 提示词里的要点数 = 进了这一版的要点数 | 自动化（node） |
| T13 | 模型正文含禁用词时整版回落 | `integrity.generator === 'rules'` 且 `degradeReason` 非空 | 自动化（node） |
| T14 | 模型改正过的要点标为模型写的 | `diff[].writtenBy === 'model'` | 自动化（node） |
| T15 | 规则引擎改写的要点标为规则写的 | `diff[].writtenBy === 'rules'` | 自动化（node） |
| T16 | explain 的取舍依据与改动对照条数一致 | `explain.bullets.length === version.diff.length` | 自动化（node） |
| T17 | explain 的每条要点都能指出它命中了哪几条要求 | `matchedRequirements` 由 `coverage` 反查得到 | 自动化（node） |
| T18 | explain 记录两次模型调用的阶段与 token | `model.calls` 有 `analyze` 与 `rewrite` 两条（模型路径） | 自动化（node） |
| T19 | 规则路径的 explain 说明没有用模型 | `model.calls` 里没有 `rewrite` 阶段，或该阶段 `model` 为空 | 自动化（node） |
| T20 | 面板对没有 explain 的旧版本显示空态 | 渲染出 `no-generation-trace` 空态 | 自动化（jsdom） |
| T21 | 面板展示生成经过的四个区块 | 四个区块标题都在 | 自动化（jsdom） |
| T22 | 面板的要点条数超过 20 时折叠并可展开 | 默认只渲染 20 条；点「展开全部」后全部渲染 | 自动化（jsdom） |
| T23 | 面板的「看改动对照」切到改动对照页签 | `tab` 变成 `diff` | 自动化（jsdom） |
| T24 | 客户端超时时提示说清下一步 | 抛出的 `ApiError` 的状态是 `llm-timeout` | 自动化（node） |
| T25 | jd/analyze 的响应带比对范围 | `scope.comparedBullets` 与 `scope.totalBullets` 存在 | 自动化（node，服务端路由） |
| T26 | 版本列表的响应不含 explain | 列表每一项都没有 `explain` 键 | 自动化（node，服务端路由） |
| T27 | 版本详情的响应含 explain | 详情响应里有 `explain` | 自动化（node，服务端路由） |
| T28 | engine 的响应带 timeoutMs | 配了供应商时有值，没配时为 null | 自动化（node，服务端路由） |
| T29 | 界面上不出现「底稿」 | 现有守卫已覆盖（`flows.spec.ts`） | 自动化 |
| T30 | 面板显示的要点原文不含禁用词 | 模型正文补 `assertCleanOutput` 后不再出现 | 自动化 |
| T31 | 面板在窄屏下不横向溢出 | 375 / 800 两档走查 | **浏览器** |
| T32 | 生成一页后的完整链路 | 解析 JD → 生成 → 打开说明面板 → 四个区块的数字与实际一致 | **浏览器** |
| T33 | 面板的「展开全部」在窄屏可点 | 375 档走查 | **浏览器** |
| T34 | 超时后刷新版本列表能看到那一版 | 客户端超时后服务端已完成，重试命中 `Idempotency-Key` | **浏览器**（需要构造慢模型） |

### 6.2 守卫影响

**`frontend/src/flows.spec.ts`**：

| 检查 | 本轮影响 |
| --- | --- |
| 样式文件里出现视觉字面量 | 新组件的样式全部走变量（§2.5）——不写 px 字面量 |
| 从 `element-plus` 根包导入 | 新组件只用模板里已有的 `el-table` / `el-tag` / `el-button` / `el-empty`，**不写 import** |
| 界面模板出现「底稿」或禁用词 | 面板文案用「简历」；不出现禁用词 |
| 动作区里的按钮不是 small 尺寸 | 两个新按钮都 `size="small"` |
| 一个界面上出现第二个实心主色 | 面板里没有实心按钮；全屏仍只有「导出 PDF」 |
| 动作区之外出现带边框的次要动作 | 两个新按钮都是 `text`（无边框） |
| 卡片内的行内动作没带 `:icon` | 两个新按钮是**文字**按钮（有文字标签），不适用 `:icon` |
| 状态表条目为空 / 失败提示没给下一步 | 新增的 `no-generation-trace` 要有标题、说明、主动作 |
| 失败与空态的文案只从状态表里取 | 面板的空态用 `EmptyState` 组件 + 状态表条目；**面板其余文案是静态说明，不是状态**——要在守卫里确认这两者不被混为一谈 |
| 占位符只用 `{value}` | 新增状态的说明里若要用数字，用 `{value}` |

**`frontend/src/repo-hygiene.spec.ts`**：无影响（不新增源码目录、不新增 `.env` 文件）。

**`docs/api-contract.md` 与错误码表的三处对应**：不新增错误码，断言不受影响。

### 6.3 回归范围

改动可能破坏的已有行为，逐条列出要回归的用例：

| 已有行为 | 回归方式 |
| --- | --- |
| **规则路径的版本正文逐字不变** | `packages/shared/src/engines/generateVersion.spec.ts` 全量 + `coverage.spec.ts` 的重构回归（规则路径产物不变） |
| **模型路径的覆盖与规则路径逐条一致**（D3 改了判定） | `jdAnalysis.spec.ts` + `flows.spec.ts` 的「走通登录 → 放入 → 诊断 → 生成 → 列表 → 详情」 |
| **同一份 JD 生成两次得到两份并存快照** | `flows.spec.ts` 已有用例 |
| **第二步看到的覆盖与版本详情一致** | `flows.spec.ts` 的完整流程回归 |
| **导出的三种格式内容一致、数字都来自简历** | `flows.spec.ts` 的导出用例 + `docs/regression-cases.md` §1.6 / §1.7 |
| **版本列表与详情页的按钮形态** | `flows.spec.ts` 的「操作按钮的形态」整组 |
| **删除版本不影响底稿** | 已有用例 |
| **打印稿不受影响** | `docs/regression-cases.md` §5 —— 面板不进打印页 |
| **旧版本仍能打开** | 浏览器：打开改动前生成的版本 → 面板显示空态，其余页签正常 |

**黄金路径**（`docs/regression-cases.md` §1.6 生成版本）：解析 JD → 确认要求命中 → 生成版本 → 打开详情 →
**新页签「这一版是怎么来的」** → 四个区块的数字与实际一致。

---

## 7. 开发任务拆分

> 每条任务一个可验证的行为。顺序：共享包 → 服务端 → 前端 → 文档 → 验收。
> 共享包的类型先定，否则两端同时改会打架。

### A 组 · 共享包（先做，两端都依赖它）

| # | 任务 | 验收 |
| --- | --- | --- |
| A1 | `candidateSelection.ts`：按 `relevance > 0` 过滤、按相关度降序、每个条目至少留一条、截到上限；返回候选与取舍记录 | [自动化] T1–T3 |
| A2 | `coverage.ts` 抽出 `matchRequirement`，`computeCoverage` 改为逐条调用它 | [自动化] T10（规则路径产物逐字不变） |
| A3 | `jdAnalysisPrompt.ts` 改收候选要点，保留原序号，提示词说明跳号；`PROMPT_VERSION` 升 `llm-jd-analysis-v2` | [自动化] T4–T6 |
| A4 | `jdAnalysis.ts` 接入候选筛选；序号回查改查候选表（保留越界丢弃）；**新增 D3 复核**（模型判未覆盖的要求用规则在全部要点上重判）；`JdAnalysisResult` 加 `bulletsSent` / `bulletsTotal` / `call` | [自动化] T7–T9 |
| A5 | `llmPrompt.ts` 的要求只发已覆盖的；`PROMPT_VERSION` 升 `llm-rewrite-v2` | [自动化] T11–T12 |
| A6 | `generator.ts` 补 `assertCleanOutput` 复查；`applyPatchedDiff` 打 `writtenBy` 标记 | [自动化] T13–T15 |
| A7 | `explain.ts`：`buildExplain` / `mergeRewriteExplain` 纯函数，从 coverage / evidence / diff / claims 组装面板数据 | [自动化] T16–T19 |
| A8 | `domain/types.ts` 加 `VersionExplain` 等类型与 `ResumeVersion.explain`；`DiffEntry.writtenBy`；`engines/types.ts` 加 `JdAnalysisCall` 与存档形状 | [自动化] 类型检查通过 |

### B 组 · 服务端

| # | 任务 | 验收 |
| --- | --- | --- |
| B1 | `llm/config.ts` 加 `maxCandidateBullets`（`LLM_MAX_CANDIDATE_BULLETS`，默认 40）；`index.ts` 装配进 analyzer | [自动化] T4–T6 走通 |
| B2 | `routes/jd.ts`：`toResponse` 加 `scope`；`toStoredAnalysis` 带上 `call` | [自动化] T25 |
| B3 | `routes/resume.ts`：版本响应带 `explain`；**列表剥离 `explain`** | [自动化] T26、T27 |
| B4 | `routes/engine.ts`：响应加 `timeoutMs` | [自动化] T28 |
| B5 | `api/client.ts`：客户端超时（`AbortSignal.timeout`），超时抛 `llm-timeout` 状态的 `ApiError` | [自动化] T24 |

### C 组 · 前端

| # | 任务 | 验收 |
| --- | --- | --- |
| C1 | `api/resume.ts`：`JdAnalysisResponse` 加 `scope`；`fetchEngineStatus` 返回类型加 `timeoutMs` | [自动化] 类型检查通过 |
| C2 | `states.ts` 加空态 `no-generation-trace` | [自动化] `flows.spec.ts` 状态表检查通过 |
| C3 | `VersionExplainPanel.vue`：四个区块 + 折叠 + 空态 + 「看改动对照」 | [自动化] T20–T23 |
| C4 | `VersionDetailView.vue`：加「这一版是怎么来的」页签并接入面板 | [自动化] T21 |
| C5 | `JdView.vue`：比对结果显示「这次比对了 N 条要点（共 M 条）」 | [浏览器] |
| C6 | 样式自查：全部走变量、无 px 字面量、无根包导入、无第二个实心主色 | [自动化] `flows.spec.ts` 全绿 |

### D 组 · 文档

| # | 任务 | 验收 |
| --- | --- | --- |
| D1 | `docs/api-contract.md`：加 `scope` / `explain` / `timeoutMs` 三个字段；列表项不含 `explain`；改写「客户端超时设 30 秒」那句 | [浏览器] 无（人工核对） |
| D2 | `docs/privacy-conclusions.md` §7：改写「两件事发的是同一批内容」那句 | [浏览器] 无（人工核对） |
| D3 | `server/.env.example`：说明 `LLM_MAX_CANDIDATE_BULLETS` 与客户端超时的关系 | [浏览器] 无（人工核对） |

### E 组 · 验收

| # | 任务 | 验收 |
| --- | --- | --- |
| E1 | `npm run verify`（仓库根，两端都跑）全绿 | [自动化] |
| E2 | 浏览器走黄金路径：解析 JD → 生成 → 打开说明面板 → 四个区块数字与实际一致 | [浏览器] |
| E3 | 浏览器走边界：老版本（无 `explain`）→ 空态正常；375 / 800 两档不横向溢出 | [浏览器] |
| E4 | 浏览器验证「这一版是怎么来的」与「改动对照」「要求覆盖」「未覆盖要求」三页签不打架 | [浏览器] |

**并行性**：A 组必须串行（A1→A2→A3→A4 依赖链）。B 组与 C 组的接口形状依赖 A8，
但 B5 / C1 / C2 可以与 A 组并行。D 组在 B、C 之后。E 组最后。

---

## 8. 风险与未决问题

### 8.1 最该盯的风险

**序号一致性（D2）**——候选要点保留原序号，模型回引的号必须还能对回原文。
这条一旦破了，「查不出依据等于没引用」就失效了，事实校验的担保随之失效。
**必须有一个专门的回归用例锁住它**（T6、T7），且浏览器验收时要用一份真简历跑一遍，
肉眼核对模型引用的序号对不对得上。

### 8.2 其它风险

| 风险 | 缓解 |
| --- | --- |
| 裁剪把能命中的要点裁掉了 | D3 的复核机制（未覆盖清单不产生假阴性）+ 面板写明「比对了 N 条（共 M 条）」 |
| 提示词跳号让模型困惑 | 提示词明确说明；越界引用直接丢弃 |
| `explain` 让 `versions.payload` 变大 | 列表剥离；详情才带 |
| 缓存键不含裁剪参数，改配置后旧分析口径不同 | 面板显示的是当时的真值；运营上改配置后清缓存（§5.2） |
| 客户端超时早于服务端完成，用户以为失败了 | 超时提示写明「刷新版本列表看看，这次可能已经生成好了」；`Idempotency-Key` 保证重试不生成第二份 |
| 禁用词复查让整版降级 | 概率低；接受——底线优先于一次生成的成功率 |
| 候选上限 40 是拍的 | 是配置项，改数不用改代码；产品确认后再定默认值 |

### 8.3 未决问题（需要产品侧拍板）

| # | 问题 | 本设计的处理 | 还需什么 |
| --- | --- | --- | --- |
| 1 | `integrity.degraded` 语义矛盾（生成页说「模型这次没有用上」，详情页说「由模型生成，有 N 处回退」） | **本轮不改**（澄清文档明确排除）。设计上做了保险：面板不依赖这个标志，全部事实从 `diff` / `claims` / `violations` 推导。 | 是否另开一个 `fix-` 变更处理？**建议开**——面板上线后这个矛盾会更显眼。 |
| 2 | 候选要点的筛选口径 | D1 给出做法：`relevance > 0` + 每条目至少一条 + 上限 40（可配置） | 40 这个数对不对？要不要改成别的口径？ |
| 3 | 模型改写后的正文补禁用词检查 | 本轮补（D8），按「规格已有要求即修复」处理 | 确认这个理解对不对 |
| 4 | 每日生成次数上限与每日成本上限 | **本轮不做** | 是否单开一轮？`ADR-0005` §3 要求的三个数现在只落地了一个 |
| 5 | 生成前要不要交代一句 | 在生成页加一行「这次比对了 N 条要点（共 M 条）」 | 这行的位置与措辞 |
| 6 | 面板里要不要显示「模型写这句」的字样 | 本设计显示（`writtenBy`） | 产品上是否愿意把「这句是模型写的」明说——这会让「不编造」这条承诺的可信度更具体，但也更显眼 |
| 7 | 客户端超时的具体秒数 | 由 `GET /api/v1/engine` 下发 `timeoutMs`，前端加一分钟余量 | 超时提示要不要加「这次可能已经生成好了」这句（防用户重复生成） |
| 8 | 要不要给用户一个「取消本次生成」的入口 | **本轮不做**——那需要服务端的作业模型（要能中断模型调用），改动量远超本轮 | 是否单开一轮 |

### 8.4 与澄清文档的范围差异

澄清文档「明确不做」里写的是「不改降级 / 回退的对外说法」——本设计遵守。
但 D8（补禁用词检查）在澄清文档里是列在「工程影响」里的**修复项**，不是新范围，
本设计把它算作修复并纳入。若产品认为超范围，去掉 A6 即可，其余设计不受影响。

---

## 9. 交棒

### 9.1 一句话

这件事落在**共享包（两个新文件 + 六个改动文件）、服务端（四个路由）、前端（两个视图 + 一个新组件）**；
数据流是「规则引擎先算全部要点 → 按相关度挑候选 → 只把候选发给模型 → 模型说不覆盖时用规则在全部要点上复核」，
面板数据在生成时一次性写进版本 payload，列表剥离、详情保留。

### 9.2 关键决策

1. **裁剪只影响模型能看到什么，不影响系统能判定什么**——模型判「未覆盖」的要求，
   用规则引擎在全部要点上复核一次，因此未覆盖清单不会有假阴性。
2. **候选要点保留原序号（跳号）**——重编序号会让模型引的号对不回原文，
   直接破坏「查不出依据等于没引用」这条底线。
3. **`explain` 存在 `versions.payload` 里，列表剥离、详情保留**——不写迁移 SQL，
   不动 `schema.ts`，老版本天然走「没有记录生成过程」的空态。
4. **面板不依赖有歧义的 `degraded` 标志**——全部事实从 `diff` / `claims` / `violations` 推导，
   这样降级语义那个矛盾无论怎么修，面板都是对的。
5. **客户端超时由服务端下发**——契约里承诺的「客户端超时设 30 秒」在实现里从来没有，
   而 30 秒会把每一次真实的模型调用都掐掉；改成 `timeoutMs + 60s`，两边不再各写一个数。

### 9.3 任务数

**22 条**（A 组 8、B 组 5、C 组 6、D 组 3、E 组 4）。其中 **浏览器验收 5 条**（C5、E2、E3、E4 与 D 组的人工核对）。

### 9.4 风险

**序号一致性**（§8.1）——候选要点保留原序号，模型回引的号必须还能对回原文。
破了这条，事实校验的担保就失效了。
