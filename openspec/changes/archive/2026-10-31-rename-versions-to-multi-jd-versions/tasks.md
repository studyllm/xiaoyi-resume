## 1. 导航与标题

- [x] 1.1 `frontend/src/layouts/DefaultLayout.vue`: 菜单项「定向版本」→「多 JD 版本」
- [x] 1.2 `frontend/src/views/VersionsView.vue`: 页面标题「定向版本」→「多 JD 版本」
- [x] 1.3 `frontend/src/router/index.ts`: 两处路由标题 → 「多 JD 版本」「多 JD 版本详情」

## 2. 句子里的旧词按规范清成「版本」

- [x] 2.1 `frontend/src/views/VersionsView.vue`: 副标题与删除确认
- [x] 2.2 `frontend/src/views/DraftView.vue`: 覆盖确认与副标题
- [x] 2.3 `frontend/src/views/ImportView.vue`: 覆盖确认
- [x] 2.4 `frontend/src/views/JdView.vue`: 说明文字
- [x] 2.5 `frontend/src/views/WelcomeView.vue`: 大标题与两处说明
- [x] 2.6 `frontend/src/components/LoginCard.vue`: 两处说明

## 3. 文档与规范

- [x] 3.1 `docs/v0.1-产品需求文档.md`: 界面用词对照说明
- [x] 3.2 `openspec/specs/resume-terminology/spec.md`: 用词对应关系与相关场景
- [x] 3.3 `openspec/specs/resume-preview-and-export/spec.md`: 「定向版本」字样

## 4. 验证

- [x] 4.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 4.2 全仓搜「定向版本」，界面文案里一处都不剩
- [x] 4.3 浏览器实测：左侧菜单与版本列表页标题都是「多 JD 版本」，各页提示语读起来通顺
