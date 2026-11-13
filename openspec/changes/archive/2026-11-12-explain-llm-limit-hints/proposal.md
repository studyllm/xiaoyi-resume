## Why

真实规模的简历上，模型这条路走不通，而失败的原因不可行动。

用那份 77 条要点的简历实测（服务端直接调模型）：

```
耗时 310 秒
错误：模型返回的内容为空
```

两个问题叠在一起：

- **超时**：`LLM_TIMEOUT_MS` 是 120 秒 ✗ —— 生成一整版 77 条要点要 5 分钟 ✗ → 超时 → 回落规则引擎。
- **输出被截断**：模型是推理模型 ✗ —— 推理内容先吃掉了输出额度 ✗ → 正文一个字没写出来 ✗ → 客户端只看到「模型返回的内容为空」✗。

两个原因在日志里都不可行动：用户看到「The operation was aborted due to timeout」✗ 不知道该调什么 ✗；看到「模型返回的内容为空」✗ 更不知道 ✗。

## What Changes

- **超时的原因说清该调什么**：「模型响应超时（上限 120 秒）。生成一整版简历要更久，请调大 LLM_TIMEOUT_MS。」
- **输出被截断单独认出来**：响应里 `finish_reason` 是 `length` 时说明「模型输出被截断（上限 N token）。请调大 LLM_MAX_TOKENS。」——这跟「模型压根没写」是两回事，重试解决不了。

## Capabilities

### New Capabilities

无。

### Modified Requirements

- `jd-version-generation`: 「模型没调通时说清是哪个原因」补上「说清该调哪个配置」

## Impact

**代码**

- `server/src/llm/client.ts`：超时的翻译；`finish_reason === 'length'` 的识别
- `server/src/llm/client.spec.ts`：两条用例
- `server/.env.example`：按实测补上规模与时长的对应关系

**不受影响**

- 不改接口、错误码与用户文案
- 不改降级链（模型不可用仍回落规则引擎）
- 不改重试判定（超时不重试）
