## Why

点「生成版本」报 500。服务端日志：

```
Failed query: insert into "versions" ("id", "user_id", "payload", "created_at") values ($1, $2, $3, $4)
```

直接对库验证，原因是主键冲突：

```
ERROR:  duplicate key value violates unique constraint "versions_pkey"
DETAIL:  Key (id)=(version-1) already exists.
```

`versions.id` 是**全局主键**，而服务端**每个请求都新建一个 id 种子**：

```ts
await generator.generate(..., createIdSeed())   // ← 每个请求都是新种子
```

种子从 1 开始数，于是**每个版本都叫 `version-1`**。库里只要有一个版本，之后每次生成都撞主键、插入失败、接口 500。

库里那个 `version-1` 是 11-07 建的——**从那天起，生成版本就一直坏着**，只是要等用户真去生成才暴露。

## What Changes

- 服务端的版本 id 种子改成**进程级**（不是每个请求新建），起始计数用进程启动时间：同一进程内计数器持续递增，跨进程也不撞。
- `createIdSeed` 支持给起始计数（默认不变，前端与解析路径不受影响）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `version-management`: 新增「版本 id 全局唯一」

## Impact

**代码**

- `packages/shared/src/domain/ids.ts`：`createIdSeed(startFrom?)`
- `server/src/routes/resume.ts`：版本 id 用进程级种子
- `server/src/routes/resume.spec.ts`：一条用例

**不受影响**

- 不改接口、错误码与用户文案
- 不改版本正文、事实账本与生成逻辑
- 不改前端与解析路径的 id（草稿内部的 id 不入库，撞了无害）
