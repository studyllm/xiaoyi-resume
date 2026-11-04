## 1. 状态表

- [x] 1.1 新建 `frontend/src/domain/states.ts`，定义 `StateCopy`（标题、说明、动作）与 `stateTitle` / `stateHint` / `stateMessage` 三个取值函数，占位符用 `{name}` 形式
- [x] 1.2 登记失败态：解析无内容、解析失败、保存失败、无可保存结果、JD 为空、JD 解析失败、无简历不能生成、生成失败、复制失败、缺少简历、演示数据载入失败、PDF 的八种失败、抬头缺失、本地存储不可用，以及给 P3 预留的网络失败与未登录两条
- [x] 1.3 登记空态：还没有简历、还没有版本、还没有诊断结果、诊断后零意见、批注被筛空、批注全被忽略、JD 没提取到要求条目、版本不存在、没有可对照的改动、要求全部有对应事实
- [x] 1.4 登记警告态：未认出分区、识别不完整、结构问题有若干处

## 2. PDF 失败文案归位

- [x] 2.1 `pdfText.ts` 的 `PdfTextFailure` 从 `{ reason, message }` 改为 `{ reason, state, vars }`，文案从状态表取
- [x] 2.2 「PDF 读取组件加载失败」与「这份 PDF 读不出来」拆成两条状态，原因码仍归到 `unknown`
- [x] 2.3 更新 `pdfText.spec.ts` 的断言，改为检查状态表里的文案

## 3. 视图接入

- [x] 3.1 `ImportView.vue`：解析无内容、解析失败、无可保存结果、保存失败、PDF 失败与无文字层，走状态表；失败告警拆成标题与说明两栏
- [x] 3.2 `JdView.vue`：JD 为空、JD 解析失败、无简历不能生成、生成失败，走状态表
- [x] 3.3 `VersionsView.vue`：复制失败、列表里的「还没有简历」一行，走状态表
- [x] 3.4 `VersionDetailView.vue`：复制失败、抬头缺失，走状态表
- [x] 3.5 `DraftView.vue` 与 `DiagnosisView.vue`：空态改三层结构，「还没有诊断结果」走状态表
- [x] 3.6 `WelcomeView.vue`、`router/index.ts`、`DefaultLayout.vue`：演示数据载入失败、缺少简历、本地存储不可用，走状态表

## 4. 空状态补齐

- [x] 4.1 `JdView.vue` 的「没有从 JD 中提取到明确的要求条目」补标题、说明与「编辑 JD」动作
- [x] 4.2 `VersionDetailView.vue` 的「没有找到这个版本」补标题与说明；「没有可对照的改动」与「要求全部有对应事实」补说明，不加动作
- [x] 4.3 `CommentSidebar.vue` 与 `SidebarEmpty.vue` 改三层结构，并把空状态拆成「还没诊断」「零意见」「被筛空」「全被忽略」四种
- [x] 4.4 「清除筛选」动作把严重度与类别两个筛选都复位

## 5. 文档

- [x] 5.1 写 `docs/error-taxonomy.md`：按失败、空、警告三类登记每条状态的触发条件、文案与用户可执行的动作
- [x] 5.2 写 `docs/ui-copy-voice.md`：语气规则、用词规则、三层空状态结构、什么该写进状态表什么不该

## 6. 守卫与验收

- [x] 6.1 `flows.spec.ts` 断言状态表里每条文案非空、不含内部术语与禁用词
- [x] 6.2 `flows.spec.ts` 断言视图、组件与布局里不出现失败与空态的字面文案，只能从状态表取；例外要显式登记并写明原因
- [x] 6.3 `npm run type-check` 零错误，`npm run test` 全绿
- [x] 6.4 浏览器里逐条走一遍状态表里的每一条，确认文案与动作对得上
- [x] 6.5 组件库把 `el-alert` 的默认槽当说明区、`el-empty` 没有 title 属性——这两处按组件库的实际行为写，别照着文档想当然
