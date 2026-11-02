## Why

「数据归属于登录用户」这条规格一直写着，但代码从来没执行过。

`Draft.userId` 和 `ResumeVersion.userId` 每次保存都在写，可存储和读取完全不看它们——简历和版本都放在两个固定 key（`xiaoyi.draft.v2` / `xiaoyi.versions.v2`）里，跟用户无关。归属记了，但没执行。

结果就是：在身份框里输入一个新名字，登录态换人了，简历还是本机那唯一的一份。用户看到的是上一个人的内容，界面上却没有任何地方说明这一点——看起来像 bug，因为它是。

## What Changes

- **简历与版本按用户分槽**：存储 key 带上用户标识，不同用户的数据互不可见。
- **「当前用户」有明确定义**：只有登录了才算当前用户。未登录时没有当前用户，内存里不载入任何人的简历——退出登录就是真的退出，落地页回到「导入我的简历」。而换一个名字，就是另一份空白简历。
- **身份一变就换一份数据**：登录、退出、换名字都触发从各自槽位重新载入，不残留上一个用户的内容。
- **旧存档迁移**：全局槽位里剩下的数据按已记录的用户标识拆到各自槽位，原有简历与版本不丢。
- **身份框预填上次用过的名字**并选中：常见的「还是我」变成一键回车，也避免忘了名字进到空应用。
- **示例数据不覆盖用户自己的简历**：始终以「演示用户」身份进入，示例简历落在演示用户的槽位；示例身份不占用「上次用过的名字」。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `account-access`: 数据按用户分槽存放；「当前用户」的定义；身份变化时重新载入；身份框预填上次用过的名字
- `prototype-runtime`: 存档结构变更后的迁移规则补充「按用户拆分旧全局槽位」

## Impact

- `frontend/src/stores/persistence.ts`：新增按用户分槽的 key、上次用过的名字的 key、全局槽位迁移
- `frontend/src/stores/session.ts`：记录上次用过的名字；新增「当前用户」；`login` 支持不记住名字
- `frontend/src/stores/draft.ts`：读写各自的槽位；切换身份时清空或换入对应数据
- `frontend/src/stores/versions.ts`：同上
- `frontend/src/main.ts`：身份变化时触发简历与版本重新载入
- `frontend/src/components/IdentityDialog.vue`：预填并选中上次用过的名字
- `frontend/src/mock/loadDemo.ts`：示例数据始终用演示身份，且不记住该名字
- `frontend/src/flows.spec.ts`：新增跨用户的存储隔离守卫
- 不涉及引擎、纸面版式与界面结构；登录态与存档的整体结构不变，只是简历与版本从「一份」变成「每人一份」
