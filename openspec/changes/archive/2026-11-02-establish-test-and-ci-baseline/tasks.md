## 1. 诊断与基线

- [x] 1.1 复现验证诊断结论：在机器有其它负载的条件下跑一次限并发测试，确认失败形态是 `Test timed out in 5000ms` 而非断言失败。设计阶段已测得同一配置在机器空闲时重跑即全绿，据此判定失败是**负载相关的超时误判**、不存在真实的用例间顺序依赖——本任务把该结论连同复现方式写进 `docs/ci/README.md`，作为后续排查同类现象的参照
- [x] 1.2 若复现出的失败形态与上述结论不符（出现断言失败或固定的失败用例名）：说明存在真实缺陷，定位并修复，同时按 design.md 决策 3 的说明调整 CI 跑法 —— **未触发**：修复后的超时阈值下，8 倍与 20 倍 CPU 超订下均 470/470 全绿，无断言失败
- [x] 1.3 在机器空闲状态下测一次全量测试，记录通过用例数、总时长、transform / collect / tests 分项耗时，作为耗时基线写入 `docs/ci/README.md`（标注测量条件：机器核数、Node 版本、依赖版本）

## 2. 测试执行的确定性

- [x] 2.1 在 `frontend/vite.config.ts` 的 `test` 段补 `testTimeout: 30000` 与 `hookTimeout: 30000`
- [x] 2.2 在 `frontend/package.json` 增加两个跑法脚本：`test:parallel`（`vitest run`）与 `test:shuffle`（`vitest run --sequence.shuffle --sequence.seed=42`，种子固定）
- [x] 2.3 验证：连跑两次 `npm run test:parallel` 与两次 `npm run test:shuffle`，四次结论一致（全部通过）

## 3. 门禁入口

- [x] 3.1 新建 `frontend/scripts/verify.mjs`：按顺序执行类型检查 → `test:parallel` → `test:shuffle` → 构建；任一步失败即以非零退出码结束，并打印失败的是哪一步
- [x] 3.2 在 `frontend/package.json` 增加 `verify` 脚本
- [x] 3.3 验证：`npm run verify` 全绿；人为制造一个失败（改坏一个测试）后，确认 `verify` 失败并指出了失败步骤

## 4. CI 工作流

- [x] 4.1 新建 `.github/workflows/ci.yml`：在 push 与 pull request 上调起 `npm run verify`；不做 `continue-on-error`；任一步失败即红
- [x] 4.2 新建 `docs/ci/README.md`：写明门禁由哪几项组成、判定标准是什么、换用其它托管平台时如何改写「怎么调起 verify」这一层、耗时基线数据与全串行诊断跑法的用法
- [x] 4.3 确认工作流文件引用的 Node 版本与 `frontend/package.json` 的依赖要求一致（当前本机为 Node 22）

## 5. 引擎模式开关的口径

- [x] 5.1 新建 `frontend/.env.example`：只含 `VITE_ENGINE_MODE=mock` 与注释说明，不含任何真实取值
- [x] 5.2 在 `frontend/env.d.ts` 补 `VITE_ENGINE_MODE` 的类型声明
- [x] 5.3 新建 `docs/adr/0001-engine-mode-switch.md`：写明取值域、未知取值时回落本地规则引擎且不白屏、本地与远端的行为差异、以及「本轮不接线，将来接远端实现时再启用」的说明

## 6. 生效规格的 Purpose 补全

- [x] 6.1 为 13 份 `openspec/specs/*/spec.md` 补写 `## Purpose`：该能力域解决什么问题、当前边界在哪。不得保留占位符
- [x] 6.2 在 `openspec/config.yaml` 增加规则：归档变更时若产出新能力域，必须回填其 `## Purpose` 段，不得保留占位符
- [x] 6.3 验证：`grep -rn "TBD - created by archiving" openspec/specs/` 无命中

## 7. 仓库卫生清理

- [x] 7.1 删除误生成目录 `frontend/src/views/src/`（内含 `types/auto-imports.d.ts` 与 `types/components.d.ts`；自动导入的真实产物在 `frontend/src/types/`，不受影响）
- [x] 7.2 删除根目录的空 `package-lock.json`（92 字节，根目录没有 `package.json`，无依赖可锁）。连带删掉根 `node_modules/`（内容只是 vitest 缓存）
- [x] 7.3 清除仓库内的 `.DS_Store` 文件
- [x] 7.4 验证：启动一次开发服务器，确认自动导入类型声明仍正确生成在 `frontend/src/types/`，且不再出现嵌套的 `src` 目录；`npm run type-check` 零错误

## 8. 仓库卫生守卫

- [x] 8.1 新建 `frontend/src/repo-hygiene.spec.ts`，包含三条断言：
  - 仓库内不存在嵌套在其它目录之下的源码目录（即形如 `视图目录/src` 的路径）
  - 仓库根与 `frontend/` 下不存在 `.env` 文件（只允许 `.env.example`）
  - `openspec/specs/*/spec.md` 不含 `TBD - created by archiving` 占位符，且每份都有非空的 `## Purpose`
- [x] 8.2 守卫用中文命名描述行为与预期，与既有测试的命名风格一致
- [x] 8.3 更新 `CLAUDE.md` §8：在守卫清单里补上 `repo-hygiene.spec.ts` 的存在与职责
- [x] 8.4 验证：故意造一个违规（建一个嵌套 `src` 目录、临时放一个 `.env`、临时把某份 Purpose 改回占位符），确认守卫逐条报错；撤销后恢复绿

## 9. 验收与归档

- [x] 9.1 跑 `npm run verify`，全绿（4 项检查全部成功，用时 239.2s）
- [x] 9.2 在浏览器里走一遍黄金路径，确认本变更没有影响任何用户可见行为：落地页 → 导入 → 诊断 → 生成 → 版本 → 打印导出
- [x] 9.3 跑 `npm run type-check` 与 `npm run build`，零错误
- [x] 9.4 归档本变更：把 delta spec 合并回 `openspec/specs/`，并**回填新能力域 `test-and-ci` 的 `## Purpose`**（按 6.2 建立的规则，不得留占位符）
- [x] 9.5 归档后在 `openspec/specs/` 下确认 14 份规格全部有 Purpose，且 `grep -rn "TBD - created by archiving" openspec/specs/` 无命中
- [ ] 9.6 **待用户确认后执行**：创建远程仓库并推送，触发首次 CI 运行（创建远程仓库属于影响外部状态的动作，不在本变更的自动执行范围内）

---

## 归档记录

- **归档位置**：`openspec/changes/archive/2026-11-02-establish-test-and-ci-baseline/`
- **规格同步**：先由 `openspec-sync-specs` 同步生成 `openspec/specs/test-and-ci/spec.md`（4 条 requirement / 13 个 scenario），归档时用 `--skip-specs` 跳过重复应用——直接归档会因 requirement 已存在而中止。
- **Purpose 回填**：归档工具生成的骨架里 `## Purpose` 是硬编码占位符，同步阶段保留原样，本变更归档后手工回填为正式内容（详见 `openspec/config.yaml` 的 `rules.specs` 与 `rules.tasks`）。
- **遗留**：9.6 待用户在确定托管平台后执行。
