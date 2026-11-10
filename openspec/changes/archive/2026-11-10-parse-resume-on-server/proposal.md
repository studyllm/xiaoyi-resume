## Why

导入简历时不调用接口——前端在浏览器里解析，服务端那个 `POST /api/v1/draft/parse` **没有任何调用方**。

这不是「哪个更好」的技术细节，是**冻结的契约与实现对不上**：

| 能力 | 契约（冻结） | 服务端实现 | 前端实际 |
| --- | --- | --- | --- |
| 解析简历正文 | `POST /api/v1/draft/parse`（公开、匿名可用） | ✓ 实现了 | **本地解析，不调接口** |
| 诊断 | `POST/DELETE /api/v1/diagnosis`（登录） | **没实现** | 本地诊断 |
| 生成版本 | `POST /api/v1/versions` | ✓ | ✓ 调 |

契约 §8 的上传语义画的是「PDF 提取成功 → 文本发给 `POST /api/v1/draft/parse` → 服务端解析成结构化底稿」，README 也写着「解析、诊断与版本生成由服务端的规则引擎完成」——**只有版本生成是真的**。

两边引用的是同一份引擎源码（`packages/shared`），所以「谁解析」不影响结果一致性（ADR-0004 的保证）。这是工程与隐私的取舍，不是正确性问题。

## What Changes

- **导入页的解析改走服务端**：粘贴的正文与 PDF 提取出的文字都发给 `POST /api/v1/draft/parse`，结果拿回来在纸上编辑。与契约一致，服务端那个端点不再空转。
- **服务端不可达时，导入页说清连不上服务器**并给出下一步——解析从此需要服务端，这是行为变化，要写清。
- **5xx 配一段不是 JSON 的正文，算「连不上」而不是「出了点问题」。** 我们的服务端永远回 JSON（契约 §2.2），所以这种响应说明请求没到我们的服务端——中间那层（开发代理、网关）回的字。开发环境里后端挂掉时，Vite 代理回的就是这么一段 500；不这么判，导入页只能说「出了点问题」，用户不知道该等什么。
- 诊断与 JD 解析**继续留在浏览器**：服务端还没实现 `POST /api/v1/diagnosis` 与 `POST /api/v1/jd/analyze`，动它们要先补端点，不在本次范围内。代价是两边做法不一致（解析走服务端、诊断走浏览器），契约里诊断那两条端点留着等实现。
- README 里「解析、诊断与版本生成由服务端的规则引擎完成」改成实际的样子。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-draft`: 新增「导入页的解析由服务端完成」，并写清服务端不可达时怎么办

## Impact

**代码**

- `frontend/src/api/resume.ts`：加 `parseResume`
- `frontend/src/api/client.ts`：5xx 且正文不是 JSON 时判成「连不上」
- `packages/shared/src/domain/states.ts`：加一条给解析用的「连不上」状态——它与「离线」那条不是一回事，那边是「等连上再保存」，这边是「等连上再解析」
- `frontend/src/stores/draft.ts`：`ingest` 改成异步，走服务端
- `frontend/src/views/ImportView.vue`：解析改成异步等待
- `frontend/src/mock/loadDemo.ts`：演示数据那一步改成等待
- `frontend/src/stores/draft.spec.ts`、`frontend/src/views/ImportView.spec.ts`、`frontend/src/flows.spec.ts`：跟着改
- `README.md`、`docs/api-contract.md`：说法改成实际的样子

**不受影响**

- 不改任何端点的路径、请求体与响应体——服务端那个 parse 端点早就实现好了
- 不改诊断与 JD 解析的行为
- 不改解析结果的形状：同一份引擎源码，输出的分区、要点、置信度、警告都一样
- 不新增依赖
