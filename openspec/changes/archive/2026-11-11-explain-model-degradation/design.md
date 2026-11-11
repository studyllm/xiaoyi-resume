## Context

模型没调通时，版本上只有 `degraded: true` 与 `generator: 'rules'`——**没有原因**。原因在生成日志的 trace 里，而生成日志不是界面的一部分。

于是用户看到「模型这次没有用上」，只能自己去翻日志或问人。

## Goals / Non-Goals

**Goals:**

- 用户在生成的那一刻就知道模型为什么没调通。
- 原因指向可执行的下一步。

**Non-Goals:**

- 不改降级链的行为。
- 不改端点的结构（版本对象多一个字段，契约允许加字段）。
- 不动简历正文与事实账本的校验口径。

## Decisions

### D1. 原因放在 `integrity.degradeReason`

`integrity` 里已经有 `degraded` ✓ —— 「降级了」与「为什么降级」放在一起 ✓，不必再往版本上加第二个字段。

（版本上另有一个 `trace` ✓，那是事实账本的证据（facts/claims）✓，不是生成过程的日志 ✓ —— 两者不要混。）

### D2. 生成时提示，详情页也带

只在详情页说是不够的 ✗ —— 用户点完「生成版本」就跳走了 ✓，未必会去看详情页 ✓。两处都说 ✓。

提示的文案走状态表（`model-degraded`）✓，原因作为占位符带进去 ✓。

### D3. 超时不重试

超时重试没有意义：同样的输入再发一次还是那么慢 ✓ —— 白等一遍还把等待时间翻倍 ✓。而生成一整版简历本来就慢 ✓。

网络错误与 5xx 仍然重试 ✓（那两种重试有意义 ✓）。

### D4. 超时与输出上限按「一整版简历」定

实测：50 条要点 + 一份 JD，MiniMax-M3.1-Flash 要 29.5 秒 ✓，`max_tokens=2000` 会被截断 ✓（`finish_reason: length` ✓）。

默认值 30 秒 / 2000 token 是按「一次问答」定的 ✓ —— 用在「改写一整版简历」上必然不够 ✓。`.env.example` 里写清这一点与建议值 ✓。

## 验证方式

- `packages/shared/src/engines/generator.spec.ts`：降级时版本里带着原因 ✓
- `server/src/llm/client.spec.ts`：超时不重试（只发一次 ✓）
- `frontend/src/views/JdView.spec.ts`：生成完的提示里有那个原因 ✓
- 手工：真实模型超时 → 生成完立刻弹出「模型这次没调通（…）」✓
- 仓库根 `npm run verify` 全绿 ✓
