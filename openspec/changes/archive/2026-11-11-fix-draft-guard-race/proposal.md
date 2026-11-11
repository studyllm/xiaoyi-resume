## Why

整页刷新 `/jd`（或 `/diagnosis`），明明服务端存着简历，却被送回导入页，弹一句「需要先导入简历：还没有简历内容」。

路由守卫判断「有没有底稿」时，草稿**还在从服务端读的路上**：

```ts
if (to.meta.requiresDraft && !draftStore.hasDraft) {
  ElMessage.warning(stateMessage(FAILURE_STATES['draft-required']))
  return { path: '/import' }
}
```

刷新后先问「我是谁」（`session.restore()`），会话回来时草稿的请求才刚发出——`hasDraft` 当然是 false。守卫没等它到就判「没有底稿」，把用户踢回导入页。

草稿明明在服务端。

## What Changes

- 守卫判断「有没有底稿」之前，**先等这次草稿重载结束**（草稿 store 已经把在飞的重载记下来了）。
- 草稿 store 暴露一个「等这次重载结束」的入口，给守卫用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-draft`: 新增「需要底稿的页面要等草稿加载完再判断」

## Impact

**代码**

- `frontend/src/stores/draft.ts`：暴露 `whenRestored()`
- `frontend/src/router/index.ts`：判断有没有底稿之前先 `await draftStore.whenRestored()`
- `frontend/src/router/index.spec.ts`：一条用例

**不受影响**

- 不改接口、错误码与用户文案
- 不改草稿的加载逻辑
- 真没有底稿时，照旧送回导入页并提示
