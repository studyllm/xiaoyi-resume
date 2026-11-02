# 门禁与 CI

## 门禁由哪几项组成

门禁只有一个入口：`cd frontend && npm run verify`。它按顺序执行四项检查，任一项失败即以非零退出码结束，后续检查不再执行。

| 顺序 | 检查 | 命令 | 为什么排在这个位置 |
| --- | --- | --- | --- |
| 1 | 类型检查 | `npm run type-check` | 最便宜，类型错误最先暴露 |
| 2 | 全量并行测试 | `npm run test:parallel` | 主跑法，最快 |
| 3 | 打乱顺序测试 | `npm run test:shuffle` | 二次探针，抓用例间的隐式依赖 |
| 4 | 构建 | `npm run build` | 最贵，放最后 |

第 3 项与第 2 项跑的是**同一批 470 个用例**，只是文件执行顺序被打乱（种子固定为 42）。**两者都通过，门禁才算通过。**

本地跑法：

```bash
cd frontend
npm run verify
```

## 判定标准

- 门禁通过：四项检查全部成功。
- 门禁失败：任意一项失败。失败信息会指出是哪一项，其余项不再执行。
- **不允许失败后继续**（持续集成配置里没有 `continue-on-error`）。

## 为什么测试要跑两遍

第二遍不是为了「多测一次」，而是**把偶发红变成可复现红**。

打乱顺序跑法用的种子是固定的（`--sequence.seed=42`），因此 CI 报红后，用同一条命令在本地能重现同一批用例。如果用随机种子，失败就不可复现，排查成本会高一个量级。

想在本地主动找顺序依赖时，用随机种子多跑几次：

```bash
cd frontend
npx vitest run --sequence.shuffle
```

## 超时阈值为什么是 30 秒

`frontend/vite.config.ts` 里把 `testTimeout` 与 `hookTimeout` 都设为 30000ms，默认值是 5000ms。

**根因不在测试本身。** 实测单用例最长 2.2s，多数在 300–1200ms；耗时主体是 `collect`（模块加载与 jsdom 环境创建），因为 `server.deps.inline: ['element-plus']` 让每个 worker 都要把 Element Plus 的样式与组件重新 transform 一遍。

机器负载升高时，排队等待被算进了用例的执行时间，5 秒的阈值就会把「排队」误判成「失败」——失败信息是 `Test timed out in 5000ms`，而用例逻辑没有任何问题。勘察期首次全量并行跑就出现过 8 个这样的失败。

30 秒是单用例实测最长耗时的 13 倍余量。实测验证：

| 条件 | 结果 | 总时长 | collect |
| --- | --- | --- | --- |
| 机器空闲 | 470/470 通过 | 30.46s | 121.49s |
| 8 个 CPU 负载进程 | 470/470 通过 | 53.46s | 239.21s |
| 20 个 CPU 负载进程（20 倍超订） | 470/470 通过 | 140.70s | 455.33s |

**单用例超过 20 秒应视为待优化项**，不要依赖超时兜底。

## 耗时基线

测量条件：macOS 15.7.4（x86_64）、12 逻辑核 / 6 物理核、16 GB 内存、Node v22.22.1、npm 10.9.4、Vitest 2.1.9、依赖版本见 `frontend/package-lock.json`。

| 跑法 | 结果 | 总时长 | transform | collect | tests | environment |
| --- | --- | --- | --- | --- | --- | --- |
| 全量并行（空闲） | 470/470 | 30.46s | 15.09s | 121.49s | 46.01s | 25.76s |
| 打乱顺序 seed=42 | 470/470 | 76.49s | 38.29s | 266.29s | 88.48s | 68.05s |
| 全串行 | 470/470 | 128.83s | 12.41s | 48.07s | 38.00s | 13.82s |

基线会随机器与依赖版本漂移，**用作对照参考，不作硬门禁**。后续阶段需要对照时重新测量。

## 全串行是诊断手段，不是常规跑法

`npx vitest run --no-file-parallelism` 串行跑完 470 个用例要 128.83s，是默认跑法的 4 倍，但 collect 成本最低（48s）——并发越高，transform 与环境创建的共享资源争抢越明显。

用途只有一个：**怀疑存在用例间隐式依赖时**，用它确认失败是否与并发有关。

```bash
cd frontend
npx vitest run --no-file-parallelism
```

曾经观察到限并发（`maxThreads=4`）下有 2 个用例失败，而同一配置在机器空闲时重跑即全部通过——说明失败来自负载相关的超时误判，不是真实的顺序依赖。

## 换用其它托管平台

门禁**内容**由 `frontend/scripts/verify.mjs` 单一定义，与托管平台无关。工作流文件只负责「在什么时机、由什么事件、调起 verify」，不重复定义检查步骤。

当前 `.github/workflows/ci.yml` 是 GitHub Actions 的实现。换平台时只改写下面这一层：

1. 拉取代码
2. 装 Node 22
3. 在 `frontend/` 下 `npm ci`
4. 在 `frontend/` 下 `npm run verify`

以 Gitee Go 为例，等价做法是新建流水线、同样配这四步，其中第 4 步是自定义命令 `cd frontend && npm run verify`。

## 仓库设置清单

以下几项在 GitHub 网页设置里完成，**都需要仓库 admin 权限**（write 级协作者调用 API 会得到 404）。做完一遍就不用再来了。

| 项 | 位置 | 值 |
| --- | --- | --- |
| 仓库标签 | 仓库首页右侧 About → 齿轮图标 → Topics | `vue` `vue3` `typescript` `vite` `pinia` `element-plus` `vitest` `resume` `resume-builder` `openspec` |
| 仓库描述 | 同上 | 一句话说清它是什么，例如「一份简历，按 JD 生成多个互不影响的版本」 |
| 主干保护 | 见上一节 | `main` 受保护，只能经 PR 合入 |
| 合并方式 | Settings → General → Pull Requests | 只留 Squash merging，关掉 merge commits 与 rebase |
| 可选：关掉用不上的功能 | Settings → General → Features | Wiki、Projects、Issues 按需关 |

标签在 About 区域里逐个输入并按回车添加，最后点 Save topics 才会生效。

## 分支与 PR 流程

`main` 是主干，**受保护，只能通过 PR 合入**。

| 项 | 约定 |
| --- | --- |
| 分支命名 | `feat/` `fix/` `docs/` `chore/` + kebab-case 短述，如 `feat/pdf-intake` |
| 一个 PR 只做一件事 | 规格、实现、文档分开提，避免评审时看不清边界 |
| PR 必须写清 | 改什么、为什么、怎么验的。对应任务清单里勾掉哪几条 |
| 合并方式 | squash merge——主干历史保持线性，一个变更一条记录 |
| 合并前必须 | CI 门禁全绿（`verify` 作业） |
| 直接推主干 | 仅限紧急修复，且事后补 PR 记录 |

主干保护需要在仓库设置里开启，**这一步需要仓库 admin 权限**（所有者本人，或被授予 admin 的协作者）。有 write 权限的协作者做不了——GitHub 会返回 404。

### 方式一：Rulesets（推荐）

Rules → Rulesets → New ruleset → New branch ruleset：

| 项 | 值 |
| --- | --- |
| Ruleset Name | `main 分支保护` |
| Enforcement | Active |
| Target branches | `main`（或 Include → `refs/heads/main`） |

Rules 部分勾选：

- Require a pull request before merging（required_approving_review_count = 1）
- Require status checks to pass → 添加 `verify`
- Require linear history
- Block force pushes
- Block branch deletions

### 方式二：经典分支保护

Settings → Branches → Add rule → `main`：

- Require a pull request before merging（勾选）
- Require status checks to pass（勾选，选 `verify` 作业）
- Require branches to be up to date before merging（勾选）
- Do not allow bypassing the above settings（勾选）

再把 Settings → General → Pull Requests → Allow merge commits 关闭，只留 **Squash merging**。

### 验证保护是否生效

`main` 的保护规则已开启并实测生效。探测方式（不要在正式提交上做）：

```bash
# 造一个只含空提交的探针分支并推上去
git checkout -b probe/protection-check
git commit --allow-empty -m "chore: 探测"
git push origin probe/protection-check

# 关键测试：把它快进推上主干
git push origin probe/protection-check:main
```

应当被拒，服务端返回：

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
```

> **注意**：`git push --dry-run` **不会**触发 GitHub 的保护检查，干跑照样显示成功。判断保护是否生效要看真实推送的返回，或读 `gh api repos/<owner>/<repo>/branches/main --jq '.protected'`。

探针用完记得清理：

```bash
gh pr close <n> --delete-branch
git checkout main && git branch -D probe/protection-check
```

### 当前规则的实际状态

2026-11-02 实测确认：

| 项 | 状态 |
| --- | --- |
| 直推主干 | 被拒——必须经 PR |
| 必需状态检查 | `verify`。PR 在它跑完前是 `BLOCKED`，通过后才解除 |
| 必需评审 | 1 个 approving review。`verify` 通过后 PR 仍 `BLOCKED`，`reviewDecision` 为 `REVIEW_REQUIRED` |
| 合并方式 | 只允许 squash merge |
| 管理员绕过 | 状态检查的 `enforcement_level` 是 `non_admins`——管理员不受状态检查约束 |

**这对日常协作的影响**：仓库只有一个人审阅时，每个 PR 都需要你点一次 Approve。若你不想审阅，`enforcement_level` 允许管理员绕过状态检查——但「需要 approving review」这条不受绕过影响。

## 相关文档

- 引擎模式开关的口径：`docs/adr/0001-engine-mode-switch.md`
- 本变更的设计与取舍：`openspec/changes/archive/2026-11-02-establish-test-and-ci-baseline/design.md`
