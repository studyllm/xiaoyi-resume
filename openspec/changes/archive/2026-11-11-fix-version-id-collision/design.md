## Context

`versions.id` 是全局主键（text），而服务端每个请求都新建一个 id 种子，种子从 1 开始数——每个版本都叫 `version-1`。

## Goals / Non-Goals

**Goals:**

- 版本 id 全局唯一，生成不会因为主键冲突失败。

**Non-Goals:**

- 不改版本正文、事实账本与生成逻辑。
- 不改草稿内部那些 id（section/item/bullet）——它们存在草稿的 payload 里，不入库，撞了无害。

## Decisions

### D1. 种子进程级，不是请求级

服务端持有**一个**种子，整个进程共用：

```ts
const versionIdSeed = createIdSeed(Date.now())
```

- 同一进程内：计数器一直递增，第二个版本是 `version-<ts>+1` ✓
- 跨进程：起始计数是进程启动时间，两次启动拿到不同的起始值 ✓

每个请求新建种子是更自然的写法，但那样计数器每次都从 1 重来 ✗。

### D2. 起始计数用进程启动时间

`Date.now()` 毫秒级。两个进程在同一毫秒启动会拿到相同的起始计数——部署是单实例（`docker-compose.yml` 一个服务），这个风险可以接受 ✓。要更稳可以用随机数，但时间戳可读、可排序，排查时能一眼看出 id 是什么时候生成的。

### D3. 共享包的 `createIdSeed` 加一个可选起始计数

默认行为不变（从 1 开始）——前端与解析路径的 id 一模一样 ✓。只有服务端显式给起始值 ✓。

### D4. 不在插入失败时重试

撞了主键就换个 id 重试，能绕过症状，但根因（id 不唯一）还在——下一个版本照样撞 ✓。而且重试会掩盖「id 生成有问题」这件事 ✓。

## 验证方式

- `server/src/routes/resume.spec.ts`：连续生成两个版本 → id 不同，两个都存下来。
  - **这条用例在修复前是红的**：`expected 'version-1' not to be 'version-1'` ✓
- 手工：对着库里已有 `version-1` 的状态生成一个版本 → 201 ✓
- 仓库根 `npm run verify` 全绿。
