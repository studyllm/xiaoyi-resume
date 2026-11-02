## 1. 更新产品需求文档

- [x] 1.1 `docs/v0.1-产品需求文档.md` §4 范围表：把「导出可投用的 A4 PDF」移入「在本版」，并把排除项改写为「精美排版、模板市场、双栏版式、还原原 PDF 栏位与版式」
- [x] 1.2 同文件 §5 概念：概念图补上简历抬头，说明抬头与分区一样属于底稿
- [x] 1.3 同文件 §7：新增「简历预览与 PDF 导出」小节，写明排版层级限定为单栏经典版、预览整页居中呈现、导出方式为浏览器打印且必须带文字层、抬头来源、Markdown 复制与不可做项
- [x] 1.4 同文件 §9 验收标准：新增三条——打开任一定向版本能看到 A4 预览；导出的 PDF 有文字层且包含姓名与联系方式；能按 Markdown 格式复制简历

## 2. 领域模型与存储

- [x] 2.1 `frontend/src/domain/types.ts`：新增 `DraftProfile`（姓名 / 一句话定位 / 联系方式列表），`Draft` 增加 `profile` 字段；`ResumeVersion` 增加 `profile` 字段
- [x] 2.2 `frontend/src/stores/persistence.ts`：新增 `xiaoyi.draft.v2` 键；`LEGACY_KEYS` 增加 `xiaoyi.draft.v1`；`MIGRATIONS` 增加 v1→v2 迁移步骤，为旧底稿补上空的 `profile`
- [x] 2.3 为 `Draft` 结构变化补单测：旧存档迁移后分区与要点不丢失、`profile` 为空

## 3. 解析器提取简历抬头

- [x] 3.1 `frontend/src/engines/parseDraft.ts`：从第一个分区表头之前的行提取姓名与联系方式；提取失败时 `profile` 为空且不影响解析成功
- [x] 3.2 为抬头提取补单测：标准抬头、无抬头、抬头里混有日期格式、抬头行数超过三条四种情况

## 4. 底稿与版本携带抬头

- [x] 4.1 `frontend/src/stores/draft.ts`：保存时写入 `profile`；编辑页可修改姓名、一句话定位与联系方式，修改后修订号递增
- [x] 4.2 `frontend/src/stores/versions.ts`：生成版本时把当时的 `profile` 拷进版本，之后改底稿抬头不回写旧版本
- [x] 4.3 `frontend/src/views/DraftView.vue`：新增简历抬头编辑区（姓名 / 一句话定位 / 联系方式增删）
- [x] 4.4 补单测：改抬头后旧版本携带的 `profile` 不变

## 5. Markdown 渲染

- [x] 5.1 新增 `frontend/src/engines/markdown.ts`：`renderMarkdown(version)` 把版本渲染为 Markdown，分区用二级标题、条目用加粗公司名开头的单行、要点用无序列表，并带上抬头
- [x] 5.2 为 Markdown 渲染补单测：分区层级正确、条目行正确、抬头在位、不含版本之外的事实

## 6. A4 排版预览组件

- [x] 6.1 新增 `frontend/src/components/ResumePreview.vue`：接收 `VersionSection[]` 与抬头，渲染 A4 比例的单栏简历；分区标题加粗带下划线、条目头「公司名 职位 …… 日期」两端对齐、要点悬挂缩进
- [x] 6.2 预览整页居中呈现：固定 210mm × 297mm 的纸居中放在中性背景上、带纸张投影，比视口高时纵向滚动；不做缩放适配
- [x] 6.3 同组件内提供打印样式：`@page { size: A4 }`，并在 `@media print` 中隐藏顶栏、侧栏、演示模式横幅与操作按钮
- [x] 6.4 预览按条目设置 `break-inside: avoid`，分区标题设置 `break-after: avoid`
- [x] 6.5 补单测：渲染结果包含全部分区与要点，且不含界面自身的文案；打印样式规则覆盖顶栏、侧栏与横幅

## 7. 接入预览与导出

- [x] 7.1 `frontend/src/views/VersionDetailView.vue`：新增「简历预览」页签与「导出 PDF」按钮；导出前检查抬头，缺失时提示并引导补全
- [x] 7.2 同视图：导出调起浏览器打印，并提示用户在打印目标中选择「另存为 PDF」
- [x] 7.3 同视图：「复制」改为下拉，含「纯文本」与「Markdown」两项
- [x] 7.4 `frontend/src/views/VersionsView.vue`：每个版本行增加导出入口
- [x] 7.5 「复制正文」改名为「复制纯文本」，与导出区分

## 8. 验证

- [x] 8.1 `npm run type-check`、`npm test`、`npm run build` 全部通过
- [x] 8.2 浏览器走查：版本详情预览、打印预览核对（确认纸上只有简历，没有顶栏、侧栏与演示模式横幅）、抬头缺失时的提示、列表导出、Markdown 复制
- [x] 8.3 回归：导出物中的数字与实体仍全部来自底稿；导出的 PDF 文字可被选取与检索

## 9. 实现后修复

- [x] 9.1 `frontend/src/stores/persistence.ts`：版本切片同样升到 `xiaoyi.versions.v2`，补 `profile` 与 `coverage` 的迁移步骤
- [x] 9.2 `frontend/src/stores/persistence.ts`：老键回溯按 key 家族隔离，避免把别的切片的旧数据写进当前键
- [x] 9.3 `frontend/src/components/ResumePreview.vue`：`profile` 改为可选并给默认值，缺字段时不白屏
- [x] 9.4 `frontend/src/views/VersionDetailView.vue`、`VersionPrintView.vue`：对 `profile` 与 `coverage` 做兜底，兼容老存档
- [x] 9.5 补单测：老版本存档迁移后补齐字段；读底稿键不会命中版本键的旧数据；预览组件缺 `profile` 时不崩
- [x] 9.6 浏览器复现：注入一份缺字段的老版本存档，确认打开不白屏、导出提示补全抬头
