# ADR-0001：引擎模式开关

- **状态**：已接受
- **日期**：2026-11-02
- **相关变更**：`establish-test-and-ci-baseline`

## 背景

解析、诊断、JD 解析与版本生成全部通过统一接口 `ResumeEngines` 调用（`frontend/src/engines/types.ts`），视图与状态层不依赖具体实现。`frontend/src/stores/engines.ts` 是唯一的装配点：

```ts
const ENGINES: Record<string, ResumeEngines> = {
  mock: mockEngines,
}

export function useEngines(): ResumeEngines {
  const mode = import.meta.env.VITE_ENGINE_MODE ?? 'mock'
  return ENGINES[mode] ?? mockEngines
}
```

两个问题：

1. `ENGINES` 里只有本地实现一个条目，开关当前没有第二个目标，形态上是「预留」而非「可用」。
2. 仓库里没有任何 `.env` 文件，`VITE_ENGINE_MODE` 从未被真正设置过——它恒等于 `mock` 分支。默认值是巧合，不是约定。

服务端化阶段会接入远端引擎。届时若各阶段各自定义开关口径，会出现「演示态与生产态切不开」「填错值直接白屏」这类问题。

## 决策

### 取值域

`VITE_ENGINE_MODE` 的取值域固定为两个：

| 取值 | 含义 | 状态 |
| --- | --- | --- |
| `mock` | 浏览器内的本地规则引擎 | 当前唯一可用 |
| `remote` | 服务端引擎 | 尚未实现 |

### 未知取值的降级行为

**填入任何其它值（含空串、大小写不符的 `MOCK`）、或该变量未定义时，一律回落到 `mock`。**

回落必须静默且不产生任何用户可见异常——不报错、不白屏、不弹提示。理由：

- 这个开关是部署形态的选择，不是用户能操作的功能。用户没有能力也没有义务知道它填错了。
- 服务端引擎不可用时，回落到本地规则引擎仍然能完成全部功能。静默降级比中断用户流程更符合「原型不依赖后端」的既有约束。
- 若把它做成「填错就报错」，那么每次部署配置出错都会让产品完全不可用，风险与收益不成比例。

实现上即 `ENGINES[mode] ?? mockEngines` 这一行——`ENGINES` 里没有的键自然回落到 `mock`。

### 本地与远端的行为差异

将来接入 `remote` 后，两者的差异必须限定在**数据与算力的位置**，不得改变产品行为：

| 维度 | `mock` | `remote` |
| --- | --- | --- |
| 引擎运行位置 | 浏览器进程内 | 服务端 |
| 数据存储 | 浏览器本地存储 | 服务端 |
| 时间来源 | 调用方注入的 `EngineContext.now` | 服务端时间，同样经 `EngineContext.now` 注入 |
| 输出可复现性 | 同一输入 → 同一输出 | 规则引擎部分同此；模型部分按 ADR 中另行规定的「可审计」口径 |
| 密钥 | 不涉及 | 只存在服务端，**不进浏览器包** |

视图与状态层不感知差异——这正是保留 `ResumeEngines` 接口的目的。

### 本轮不接线

本轮**只固定口径，不接线**：

- `frontend/.env.example` 提供样例文件，写明取值域与降级行为，但仓库里不提供 `.env`。
- `ENGINES` 仍只有 `mock` 一个条目。
- 接线与 `remote` 实现的落地在服务端化阶段进行。

理由：现在接出一个只有本地实现的开关，会让人误以为远端路径已经通了。口径先定死，接线时不再重新讨论。

## 何时重开这个决策

- 接入 `remote` 实现时——届时补充远端的失败处理（超时、拒答、限流）与回落策略。
- 若将来出现第三种引擎形态（如「本地规则引擎 + 本地小模型」），取值域需要扩展，届时另立 ADR 说明。

## 影响

- `frontend/.env.example`：取值域与降级行为的对外说明。
- `frontend/env.d.ts`：`ImportMetaEnv.VITE_ENGINE_MODE` 的类型声明，取值域与本 ADR 一致。
- `.gitignore`：`.env` 与 `.env.*` 不入库，只有 `.env.example` 入库。
