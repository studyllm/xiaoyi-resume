## 1. 存储分层

- [x] 1.1 `frontend/src/stores/persistence.ts`：新增按用户分槽的 key（`xiaoyi.draft.v3:<userId>`、`xiaoyi.versions.v3:<userId>`）与「上次用过的名字」的 key（`xiaoyi.lastName.v1`）；旧的全局 key 降级为只读迁移源
- [x] 1.2 `frontend/src/stores/persistence.ts`：新增全局槽位迁移 `splitLegacySlots()`——把旧简历与版本按 `userId` 拆到各自分槽，然后删掉旧的全局 key；拆分失败按既有机制丢弃并提示

## 2. 身份与「当前用户」

- [x] 2.1 `frontend/src/stores/session.ts`：新增 `lastName`（上次用过的名字，退出登录也保留，只给身份框预填）与 `currentUserId`（只有登录了才算当前用户）
- [x] 2.2 `frontend/src/stores/session.ts`：`login` 支持不记住名字（示例数据用演示身份时走这条），并把用户标识的拼法收敛成一个函数
- [x] 2.3 `frontend/src/stores/session.ts`：`restore` 一并读回上次用过的名字

## 3. 简历与版本按人分槽

- [x] 3.1 `frontend/src/stores/draft.ts`：`restore` 读当前用户的槽位；当前用户没有数据时清空内存里那份，不留上一个用户的内容；解析结果（未保存的暂存）不随身份清掉
- [x] 3.2 `frontend/src/stores/draft.ts`：`commit` 写当前用户的槽位
- [x] 3.3 `frontend/src/stores/versions.ts`：`restore` 读当前用户的槽位并在没有数据时清空；生成与删除写当前用户的槽位

## 4. 身份一变就换数据

- [x] 4.1 `frontend/src/main.ts`：监听「当前用户」变化，变化时重新执行简历与版本两个 store 的 `restore()`；用同步触发，保证登录后立刻换数据
- [x] 4.2 `frontend/src/main.ts`：启动时的恢复也走同一条路径（监听器 `immediate`），不单独再调一次；旧存档的拆分在监听之前跑

## 5. 身份入口与示例数据

- [x] 5.1 `frontend/src/components/IdentityDialog.vue`：打开时把上次用过的名字填进输入框并选中，用户回车即可继续
- [x] 5.2 `frontend/src/mock/loadDemo.ts`：始终以「演示用户」身份进入，且该身份不写进「上次用过的名字」

## 6. 守卫与测试

- [x] 6.1 `frontend/src/flows.spec.ts`：新增守卫——简历与版本的存储 key 必须带用户标识，不能再出现不带用户的全局写入
- [x] 6.2 `frontend/src/stores/draft.spec.ts`：换一个名字读到的是空白；换回原来的名字数据还在；退出登录后不再载入那份简历
- [x] 6.3 `frontend/src/components/IdentityDialog.spec.ts`：打开时预填的是上次用过的名字
- [x] 6.5 `frontend/src/views/WelcomeView.spec.ts`：有自己的简历时主动作是「打开我的简历」；退出登录后回到「导入我的简历」
- [x] 6.4 `frontend/src/stores/persistence.spec.ts`：旧全局存档按用户拆开——简历归给记录里的那个用户，版本按用户分组各归各家

## 7. 验收

- [x] 7.1 `cd frontend && npm run type-check` 通过
- [x] 7.2 `cd frontend && npm run test` 通过
- [x] 7.3 浏览器实测：换成一个新名字 → 读到的是空白的一份；换回原名字 → 那份简历还在；点顶栏「退出登录」→ 落地页显示「导入我的简历」；退出后想找回 → 身份框预填上次的名字，回车即回到自己那份
- [x] 7.4 浏览器实测：身份框预填上次用过的名字并选中，回车直接继续；退出后重新导入保存时，会先问身份、再问一次「确认覆盖当前简历？」，不会静默覆盖
- [x] 7.5 浏览器实测：点「用示例简历试一遍」不会覆盖用户自己那份简历（示例简历落在演示用户的槽位）；试完回到落地页，身份框里填的仍是用户自己的名字
- [x] 7.6 浏览器实测：种一份旧版全局存档（简历属于张三、版本分属张三与李四），刷新后拆到各自分槽、旧 key 消失，落地页显示「打开我的简历」
