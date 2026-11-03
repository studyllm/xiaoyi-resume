## Why

用户实测导入后提出：「加一条『这份简历有 N 处我们没认出来，检查一下』的提示」。

这个需求来自一个具体的失败形态：**分区表头没被认出来时，那一段的内容被并进上一个分区，界面上却完全静默。** 用户看到的是「少了一段」，但没有任何地方说「这里我们没认出来」。

识别率改进（`improve-resume-recognition`）把已知的写法补齐了，但真实简历的写法没有穷举——「自我评价」「获奖经历」「证书」「Selected Projects」这些**产品里本来就没有位置归属**的分区，永远不会被识别成表头，内容永远会被并进上一个分区。这类情况还会继续出现，所以需要一条兜底的提示。

## What Changes

- 解析结果里带上**疑似分区表头但没被认出来的行**
- 导入页在有这类行时给出一条提示：说清有几处、列出具体是哪几行
- 判据刻意保守：宁可漏报也不误报

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-draft`: 增补一条要求——没被认出来的分区表头要被列出来并提示用户检查。

## Impact

- **引擎契约**：`frontend/src/engines/types.ts` 的 `ParseResult` 增加 `suspectedHeaders: string[]`
- **引擎**：`frontend/src/engines/parseDraft.ts` 增加疑似表头检测
- **界面**：`frontend/src/views/ImportView.vue` 增加一条警告（带具体行）
- **测试**：`parseDraft.spec.ts` 与 `ImportView.spec.ts` 各增补用例
- **无破坏性变化**：`suspectedHeaders` 是新增字段，既有消费方不受影响

## 判据的取舍

用 30 条真实写法做量化后，阈值定在**归一化后不超过 4 个字**：

| 阈值 | 命中 | 误报 |
| --- | --- | --- |
| ≤ 4 | 9/16 | **0/13** |
| ≤ 5 | 9/16 | 2/13 |
| ≤ 6 | 10/16 | 4/13 |
| ≤ 8 | 11/16 | 7/13 |

≤ 4 是精度 100% 的那一档。再放宽就会出现「抗压能力强」「有良好的沟通能力」这类普通要点被误报——**用户被误报打扰几次之后就会忽略这条提示，那它就废了**。

代价是漏报：英文表头（「Selected Projects」「Personal Summary」）不在阈值内。实测英文规则（全是英文、每词首字母大写、词数 ≤ 2）命中 10/10 但误报 5/7（`Vue React`、`TypeScript`、`Figma` 这类单行要点会被误伤），因此**不采用**。常见英文表头（Skills / Work Experience / Education / Projects / Core Skills）已经在识别率改进里被认成表头了，不会走到这条提示。
