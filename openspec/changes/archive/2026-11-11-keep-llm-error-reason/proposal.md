## Why

用模型生成版本没调通，日志里只有一句「模型返回 402」。402 与 401 都是「没调通」，但一个是**余额不足**、一个是**密钥不对**——只有服务商自己说得清。

实测 MiniMax 的响应正文是：

```json
{"type":"error","error":{"type":"insufficient_balance_error","message":"insufficient balance (1008)","http_code":"402"}}
```

`server/src/llm/client.ts` 只把状态码留进了错误消息，**正文被整个丢掉**。结果是：用户问「为什么还是规则引擎」，日志答不上；开发者得自己去翻服务商后台才知道是欠费。

## What Changes

- 模型调用失败时，错误消息里带上**服务商自己说的原因**（优先取正文里的 `error.message`，没有就退回正文本身，截到 300 字）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `jd-version-generation`: 新增「模型没调通时说清是哪个原因」

## Impact

**代码**

- `server/src/llm/client.ts`：错误消息带上服务商的原因
- `server/src/llm/client.spec.ts`：两条用例

**不受影响**

- 不改接口、错误码与用户文案
- 不改降级链的行为（模型不可用仍回落规则引擎）
- 不改重试判定（4xx 仍不重试）
