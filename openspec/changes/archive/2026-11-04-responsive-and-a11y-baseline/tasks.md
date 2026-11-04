## 1. 断点与档位

- [x] 1.1 新建 `frontend/src/domain/breakpoints.ts`：四档分界常量与 `tierFor(width)` 纯函数
- [x] 1.2 新建 `frontend/src/domain/breakpoints.spec.ts`：分界值两侧各测一次

## 2. 视口状态

- [x] 2.1 `ui` store 增加视口宽度与档位，随窗口尺寸变化更新
- [x] 2.2 新建 `frontend/src/composables/useViewport.ts`：统一监听尺寸变化，避免各处各挂一个 resize 监听

## 3. 纸面缩放

- [x] 3.1 新建 `frontend/src/composables/usePaperScale.ts`：量容器宽度，算缩放比例，下限 0.7
- [x] 3.2 新建 `frontend/src/components/PaperCanvas.vue`：外层量宽、内层按 `zoom` 缩放
- [x] 3.3 `DraftView.vue` 与 `ImportView.vue` 改用 `PaperCanvas`；`WelcomeView.vue` 的展示纸面不动
- [x] 3.4 打印样式里把 `zoom` 复位成 1

## 4. 侧栏抽屉

- [x] 4.1 `DefaultLayout.vue`：视口小于 1024 时侧栏改成覆盖式抽屉，顶栏加唤出按钮
- [x] 4.2 点导航项、点遮罩、按 Esc 都收起抽屉
- [x] 4.3 抽屉里 `overflow-y: auto`，长菜单能滚

## 5. 窄屏降级

- [x] 5.1 视口小于 768 时不渲染工作台，改渲染降级提示，说清为什么
- [x] 5.2 降级提示的文案进状态表

## 6. 无障碍基线

- [x] 6.1 焦点环常显：统一的 `:focus-visible` 焦点环
- [x] 6.2 给所有只有图标的按钮补 `aria-label`
- [x] 6.3 纸面区域加 `aria-live="polite"` 状态播报
- [x] 6.4 `prefers-reduced-motion` 下关闭动效

## 7. 文档与守卫

- [x] 7.1 写 `docs/responsive-breakpoints.md`：四档契约、纸面缩放规则、已知限制
- [x] 7.2 守卫：图标按钮缺 `aria-label` 时测试失败
- [x] 7.3 守卫：打印样式里 `zoom` 被复位成 1
- [x] 7.4 `npm run verify` 四项全过；浏览器在 1440 / 1024 / 768 / 375 四档各走一遍
