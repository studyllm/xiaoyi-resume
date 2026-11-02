## Why

左侧菜单里的「定向版本」太抽象：用户看到这四个字，不知道那里放的是什么。

产品负责人提议改成「多 JD 版本」，并且顺带把句子里的旧词清一遍——`resume-terminology` 规范本来就写着"句子与按钮等短语境中使用「版本」"，只是实际文案里到处还是「定向版本」，规范与实现对不上。

## What Changes

**导航项与页面标题**：「定向版本」→「多 JD 版本」

```
工作
  我的简历
  简历诊断
交付
  按 JD 生成
  多 JD 版本      ← 改这里
```

「多 JD 版本」把两件事摆到台面上：一份简历可以按多份 JD 生成（这是产品的核心玩法），每个版本对应一份 JD。跟隔壁的「按 JD 生成」正好是动作与结果的一对。

中英文之间留空格，跟仓库里既有的「按 JD 生成」一致。

**句子里的「定向版本」按规范清成「版本」**（本来规范就是这么要求的）：

| 现在 | 改后 |
|---|---|
| 重新导入会覆盖当前简历。已经生成的**定向版本**保持原样。 | ……已经生成的**版本**保持原样。 |
| **每一个定向版本**都是生成那一刻的简历快照。 | **每一个版本**都是生成那一刻的简历快照。 |
| 删除这个**定向版本**？简历和其它**定向版本**不受影响。 | 删除这个**版本**？简历和其它**版本**不受影响。 |
| 登录只用来把你的简历和**定向版本**标记为你的 | 登录只用来把你的简历和**版本**标记为你的 |
| 一份简历，按 JD 生成多个互不影响的**定向版本** | 一份简历，按 JD 生成多个互不影响的**版本** |

「定向」这层语义（针对某个岗位定制、投出去就定死）没有丢：版本列表页的副标题就写着"每一个版本都是生成那一刻的简历快照"。

**规范同步**：`resume-terminology` 的用词对应关系与场景；`resume-preview-and-export` 里的「定向版本」；产品需求文档里的界面用词对照说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `resume-terminology`: 界面用词对应关系——导航项与页面标题用「多 JD 版本」，句子里用「版本」
- `resume-preview-and-export`: 「多 JD 版本可预览为 A4 简历」

## Impact

**代码**

- `frontend/src/layouts/DefaultLayout.vue`：菜单项
- `frontend/src/views/VersionsView.vue`：页面标题、副标题、删除确认
- `frontend/src/views/DraftView.vue`：覆盖确认、副标题
- `frontend/src/views/ImportView.vue`：覆盖确认
- `frontend/src/views/JdView.vue`：说明文字
- `frontend/src/views/WelcomeView.vue`：大标题与两处说明
- `frontend/src/components/LoginCard.vue`：两处说明
- `frontend/src/router/index.ts`：两处路由标题
- `docs/v0.1-产品需求文档.md`：界面用词对照说明

**不受影响**

- 不改任何交互与版式
- 不改「我的简历」「按 JD 生成」这两个词
- 不新增依赖
