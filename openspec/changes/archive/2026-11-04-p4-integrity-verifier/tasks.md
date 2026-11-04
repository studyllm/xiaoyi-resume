## 1. 决策文档

- [x] 1.1 写 `docs/adr/0003-integrity-verifier.md`：现有口径的三个不足；五类成分与哪四类硬判；fact 的结构、子句级切分与哈希 id；claim 的结构、四种 operation、置信度不参与判定；R1–R8 判定规则；动词与评级强度序；回退的粒度、目标与降级标记；`integrity` 的新形状；schema 预留位；已知限制；何时重开

## 2. 计划书同步

- [x] 2.1 P4 章节补上「事实账本与校验器口径已定」
- [x] 2.2 F4 的冻结时点改成「口径已定死、形状随 P3 的 schema v1 冻结」
- [x] 2.3 §12.5 加一行「校验覆盖到哪」
- [x] 2.4 D4 与 D12 的说明补上与本 ADR 的关系

## 3. 交接

- [x] 3.1 P3 建 schema 时按 `Fact` / `Claim` / `VersionTrace` / 新 `IntegrityReport` 的形状建表
- [x] 3.2 确认 P4 首个实现变更会带上 F10 的退役 delta（`jd-version-generation` 的「生成结果可复现」降级为「输出可审计」）
- [x] 3.3 D4（`docs/fact-traceability.md`）在 P3 结束前落成：动词强度表、评级表、虚词表、fact 切分表、判定用例集
