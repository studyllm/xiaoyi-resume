## Why

F4（事实账本/声明账本/校验器规范）是 R1「LLM 编造」这个极高风险的落点，也是**唯一决定 `ResumeVersion` 落库结构**的设计输入。schema 在 P3 定死，所以这份规范必须在 P3 开工前就位。

现在的校验（`assertNoFactsAdded`）是字符级的：输出的每个汉字都必须在原句里出现过。它对规则引擎够用——规则引擎的改写本来就是字符重排——但对 LLM 有两个问题：

1. **太严**：任何措辞改动都被拦成编造（「负责活动页面的前端开发」→「负责活动页面的前端开发与维护」），LLM 只能重排字符，等于没有价值。
2. **不够准**：职责上调（把「参与」写成「负责」）现在靠「出现了原句中没有的字」兜底，理由是错的，而且只要要点别处出现过那个字就失效。诊断侧的规则目录里挂着 `verb-strength-up`，生成侧却没强制。

所以要换一套口径：**不再问「有没有新字」，而问「有没有新事实」**。

## What Changes

- 新增 `docs/adr/0003-integrity-verifier.md`：判定口径——五类成分（度量、拉丁实体、技能评级、职责动词、中文实词），**只硬判前四类**；fact 是底稿要点按句读切出的子句，`factId` 取内容哈希；claim 带引用与 `operation`，**生成器的自评置信度不参与判定**；回退粒度是「一条输出要点」，回退目标是规则引擎对同一组 fact 的产出；`integrity` 的 `reason` 改成结构化 `kind` + 人话描述。
- 计划书同步：P4 章节、F4 的冻结时点、§12.5 加一行「校验覆盖到哪」、D4 与 D12 的说明。
- **顺带把 P3 的 schema 冻结点提前**：`Fact` / `Claim` / `VersionTrace` 的形状已由本 ADR 定死，P3 开工时就要按它建表，不能等到 P3 结束。

**不改动任何能力域的 REQUIREMENT。** `jd-version-generation` 的「生成结果可复现」降级为「输出可审计」（F10 第 3 项），以 P4 首个**实现**变更的 delta spec 形式提出，与实现一起归档。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

（无——理由同上。）

## Impact

- 新增文件：`docs/adr/0003-integrity-verifier.md`。
- 改动文件：`docs/产品开发计划-v1.0.md`。
- 不改代码。
- **P3 的 schema v1 现在就带着 `Fact` / `Claim` / `VersionTrace` / 新形状的 `IntegrityReport` 建表**——这是本 ADR 对 P3 的实际约束。
- 与 ADR-0005 是两半：0005 定「怎么调模型」，本 ADR 定「账本与校验器怎么判」。缺本 ADR，LLM 的输出没有可信的落地路径。
