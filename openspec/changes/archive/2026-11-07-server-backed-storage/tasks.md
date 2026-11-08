## 1. 前端存储层

- [ ] 1.1 `api/resume.ts`：读底稿、保存（带 If-Match）、版本列表/详情/正文、生成版本（带幂等键）、删版本
- [ ] 1.2 `stores/draft.ts`：restore 先问服务端、404 就清、连不上退回本地缓存；commit 写服务端，写不进去不改本地状态
- [ ] 1.3 `stores/versions.ts`：restore/generate/remove 走服务端，本地留只读缓存
- [ ] 1.4 两个 store 记住「正在进行的重载」，保存与生成前先等它完成
- [ ] 1.5 视图与路由守卫的调用点加 await；失败时用状态表里的文案

## 2. 服务端

- [ ] 2.1 版本列表返回完整版本（契约那一行跟着改）
- [ ] 2.2 `versions.id` 改成 text——引擎生成的 id 是 `version-1` 这种，不是 uuid

## 3. 规格

- [ ] 3.1 `prototype-runtime` 的「数据保存在浏览器本地」改成「服务端是权威，本地只留只读缓存」
- [ ] 3.2 归档

## 4. 验收

- [ ] 4.1 `npm run verify` 两端全过
- [ ] 4.2 真 Postgres 上跑通：建临时账号 → 存草稿 → 解析 JD → 生成版本 → 版本列表
