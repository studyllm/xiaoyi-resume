## Why

v0.1 已经把简历产品的全部功能面铺开（13 个能力域、78 条需求、269 个场景、470 个用例），但**没有任何一道自动判定「这次改动对不对」的闸门**：全量测试在并行执行下会随机超时（`vite.config.ts` 缺 `testTimeout`），没有 CI、没有仓库卫生约束，13 份生效规格的 `## Purpose` 全是 `TBD` 占位符，仓库里还躺着误生成的目录与空 lockfile。

这直接决定了 P1–P6 每一个阶段的验收是否可信——验收条件里大量写着「自动化验收」，如果全量测试本身就是随机红的，那么「全绿」不构成任何证据，团队会逐渐习惯性忽略红灯，`flows.spec.ts` 里的 30 条产品不变量守卫也就形同虚设。

P0 是后续所有阶段的前置条件，必须先把「改完就绿」这件事在任何机器上都变成确定结论。

## What Changes

- **测试执行改为确定性**：调整 Vitest 的超时与执行池配置，使同一份代码在任何机器上重复执行都得到相同结论；消除并行执行时的排队误判。
- **引入平台无关的门禁入口**：新增 `npm run verify`，作为「改动是否可交付」的唯一判定入口，串联测试、类型检查与构建。
- **引入 CI 工作流**：按双跑法矩阵执行门禁——全量并行一次 + 随机顺序分片一次，两种跑法都通过才算通过。目的是把「偶发红」变成「可复现红」，让不稳定用例无处遁形。
- **固定引擎模式开关的口径**：新增 `.env.example` 与 `docs/adr/0001-engine-mode-switch.md`，写明 `VITE_ENGINE_MODE` 的取值域与未知值的降级行为。当前仍只走本地规则引擎，开关不接线。
- **补齐生效规格的 Purpose**：写全 13 份 `openspec/specs/*/spec.md` 的 `## Purpose`，说明每个能力域解决什么问题、当前边界在哪；并在 `openspec/config.yaml` 加规则，防止后续归档再产生占位符。
- **清理仓库卫生问题**：删除误生成的 `frontend/src/views/src/types/` 目录与根目录的空 `package-lock.json`；`.gitignore` 补齐构建产物与本机配置。
- **增补规范守卫**：在 `flows.spec.ts` 增加三条守卫——仓库内不得出现嵌套的 `src` 目录、生效规格不得残留 `## Purpose` 占位符、环境变量文件不得入库。
- **记录测试耗时基线**：为后续阶段的性能对照留一组可比数据。

## Capabilities

### New Capabilities

- `test-and-ci`: 确定性测试执行（重复执行结论一致）、提交门禁（每次提交给出确定的红绿结论）、门禁的组成与通过标准、仓库卫生约束（误生成产物、环境变量、规格占位符不得入库或残留）。

### Modified Capabilities

无。既有 13 个能力域的需求行为均不改变。

「测试套件可重复执行」在既有规格中只以「引擎输出可复现」的形式存在于 `prototype-runtime`（仅约束引擎，不约束测试执行与门禁）；把它放进新能力域 `test-and-ci`，比扩写 `prototype-runtime` 更能反映这是工程门禁而非产品运行约束，同时避免 `prototype-runtime` 承担不相关职责。

## Impact

- **构建配置**：`frontend/vite.config.ts` 的 `test` 段（超时、执行池、测试分组）；新增 `frontend/vitest.workspace.ts`（若采用分池方案）。
- **依赖与脚本**：新增 `frontend/scripts/verify.mjs`；`frontend/package.json` 增加 `verify` 及分跑法脚本；不引入新的第三方依赖。
- **CI**：新增 `.github/workflows/ci.yml` 与 `docs/ci/ci-pipeline.md`（托管平台未定，流水线定义为平台无关，工作流文件是可直接使用的默认实现）。
- **配置与文档**：新增 `.env.example`、`docs/adr/0001-engine-mode-switch.md`；修改 `openspec/config.yaml`（加归档规则）；补全 13 份生效规格的 `## Purpose`。
- **守卫**：`frontend/src/flows.spec.ts` 增加 3 条静态检查。
- **清理**：删除 `frontend/src/views/src/types/` 与根目录 `package-lock.json`。两者均为误生成物，无运行时引用——自动导入的类型声明实际写在 `frontend/src/types/`。
- **无用户可见变化**：本变更不改变任何界面行为、文案或数据。
