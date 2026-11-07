## Why

T3.1 是 P3 的第一个任务，**先于任何代码**。理由写在计划里：「没有契约，前后端各自脑补；契约漂移是服务端化最贵的返工源」。

P3 要动的地方比前两个阶段加起来都多：数据从 localStorage 搬到 Postgres、身份从一个名字变成邮箱加密码、引擎从浏览器搬到服务端、错误从「解析失败」变成一串错误码。每一条都是前后端之间的接缝。接缝不先定死，前后端会各自脑补，然后在上线前发现字段对不上。

而且 P3 有两处「客户端与服务端谁说了算」的问题必须在这时定：**结构化简历数据由谁产出**、**用户可见文案由谁产出**。

## What Changes

- 新增 `docs/api-contract.md`：五条原则、通用约定、21 个端点、19 个错误码、幂等规则、分页口径、上传语义、降级链、版本兼容规则、契约测试的三层。
- 修订 `docs/backend-stack.md` 的目录结构：`frontend/` 留在根目录不搬，根 `package.json` 用 workspaces 声明 `["frontend", "server", "packages/shared"]`。
- 计划书同步：T3.1 状态、D1 的说明。

**不改动任何能力域的 REQUIREMENT。** 契约描述的是未实现的行为——`openspec/specs/` 是「当前生效的行为基准」，把还没建的服务端接口写进去会让它变成「期望」而不是「基准」。`server-api` 与 `data-lifecycle` 两个新能力域随服务端实现一起提。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

（无——理由同上。）

## Impact

- 新增文件：`docs/api-contract.md`。
- 改动文件：`docs/backend-stack.md`、`docs/产品开发计划-v1.0.md`。
- 不改代码。
- 契约里定下的三条口径会直接约束服务端实现：**错误码由服务端给、文案由前端映射**；**保存时服务端重跑校验**，不信任客户端提交的结构化数据；**PDF 不上传**，只发提取出的文本。
