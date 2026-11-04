## Why

界面上的失败与空状态文案目前是逐处手写的：同一个「需要先导入简历」在路由守卫和版本生成处各写一遍，措辞不同；九个 `el-empty` 里有三个既没有标题也没有主动作，用户看到「没有符合条件的批注」之后不知道该做什么；失败提示大量停在「解析失败」「生成失败」，只说了没成，没说下一步怎么办。

P3 服务端化会把一批失败原因搬到网络层，P5 要按状态逐项做发布验收——如果那时再统一文案，规格要重写一遍、已发布的界面也要跟着改。现在把状态收敛成一张表，代价最小。

## What Changes

- 新建 `frontend/src/domain/states.ts`：一张「状态 → 文案 → 可执行动作」的表，覆盖失败态、空态与拦截态三类；文案不再散落在视图里。
- 所有用户可见的失败提示改从表里取，不再写「XX 失败」这种没有下一步的说法；每条失败都带一个用户能执行的下一步或明确的出路。
- `el-empty` 统一成三层结构：标题、说明、主动作。补齐三处缺主动作的空状态（JD 没提取到要求条目、版本不存在、批注被筛空）。
- 批注栏的空状态从两种扩到三种：「还没诊断」「诊断过但零意见」「有意见但当前筛选下为空」，第三种要能一键清掉筛选。
- 新增 `docs/error-taxonomy.md`（状态表）与 `docs/ui-copy-voice.md`（文案语气与用词规则），供 P5 逐项验收。
- 失败的呈现方式从「一句话」变成「标题 + 说明 + 动作」三层。引擎的失败原因与数据形状不变。

## Capabilities

### New Capabilities

- `error-states`: 失败态、空态与拦截态的分类、每种状态的文案与可执行动作，以及文案共用的语气与用词规则。

### Modified Capabilities

- `resume-comment-anchoring`: 批注栏空状态从两种扩到三种，筛空状态要带出清除筛选的动作。
- `version-management`: 打开不存在的版本时，空状态要给出回到版本列表的出路。
- `jd-version-generation`: JD 解析不出要求条目时，空状态要给出重填 JD 的出路。

## Impact

- 新增文件：`frontend/src/domain/states.ts`、`docs/error-taxonomy.md`、`docs/ui-copy-voice.md`。
- 改动文件：`frontend/src/views/{ImportView,JdView,VersionsView,VersionDetailView,DiagnosisView,DraftView}.vue`、`frontend/src/components/CommentSidebar.vue`、`frontend/src/router/index.ts`、`frontend/src/engines/pdfText.ts`（失败原因归一到表里的状态）、`frontend/src/flows.spec.ts`（新增文案守卫）。
- 不改引擎的判定逻辑、不改数据模型、不改接口形状。
- 与 P2 其余分支（响应式、无障碍）会同时碰 `views/` 与 `components/`，合并时需要 rebase。
