## Why

产品目前只有桌面宽度这一种形态：应用侧栏固定 200px，纸面固定 210mm 宽，工作台要求 1440 以上的屏幕。窄一点的屏幕上纸面会横向溢出、侧栏会挤掉内容区，而用户手里的笔记本和一体机恰恰有大量 1280 与 1024 的宽度。

无障碍这边同样只有零星几处：图标按钮有的有 `aria-label`、有的没有；动效没有 `prefers-reduced-motion` 兜底；纸面是整页的主要内容，却没有向读屏软件播报状态的区域。

这两件事都是「有则更好」但**缺了会直接挡住一部分人**的底线问题，放在 v1.0 之前补齐，比上线后再补便宜。

## What Changes

- 新增 `frontend/src/domain/breakpoints.ts`：断点常量与视口档位的纯函数计算。
- 视口宽度进入 `ui` store，界面按档位响应。
- **<1024**：应用侧栏收成抽屉，由顶栏的按钮唤出，覆盖在内容之上；纸面按可用宽度等比缩放。
- **<768**：内容区不再渲染工作台，改为一块明确的降级提示——请在更大屏幕上使用。
- **纸面等比缩放**：纸面容器按可用宽度缩放，比例不低于 0.7；缩放后版式与打印稿一致。
- 无障碍基线：焦点环常显、图标按钮一律带 `aria-label`、纸面区域带 `aria-live` 状态播报、`prefers-reduced-motion` 下关闭动效。
- 新增 `docs/responsive-breakpoints.md`，写清四档断点下的行为契约。

范围只到「不破版 + 明确降级」，不做移动端专属布局；无障碍只做基线，完整 WCAG 审计列入 v1.1。

## Capabilities

### New Capabilities

- `responsive-layout`: 断点定义、各档位下的布局行为契约、纸面缩放规则与窄屏降级提示。
- `a11y-baseline`: 焦点可见性、图标按钮的可访问名称、状态播报区域、动效降级这四条基线。

### Modified Capabilities

- `workspace-layout`: 工作台的滚动与页头框架规则要说明窄屏下的例外（侧栏变抽屉、内容区不再渲染）。

## Impact

- 新增文件：`frontend/src/domain/breakpoints.ts`、`frontend/src/composables/useViewport.ts`、`frontend/src/composables/usePaperScale.ts`、`frontend/src/components/PaperCanvas.vue`、`docs/responsive-breakpoints.md`。
- 改动文件：`frontend/src/layouts/DefaultLayout.vue`、`frontend/src/styles/main.css`、`frontend/src/stores/ui.ts`、`frontend/src/views/{DraftView,ImportView}.vue`、`frontend/src/components/CommentSidebar.vue`、`frontend/src/flows.spec.ts`。
- 不改引擎、不改数据模型、不改解析与诊断行为。
- 与 PR #11（状态与文案体系）都会改 `main.css` 与 `DefaultLayout.vue`，合并时需要 rebase。
