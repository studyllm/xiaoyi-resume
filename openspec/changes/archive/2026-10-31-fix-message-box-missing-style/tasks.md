## 1. 弹窗的样式

- [x] 1.1 `frontend/src/views/DraftView.vue`: 去掉从 element-plus 根包的显式引入，交给自动导入（它会连带引入组件样式）
- [x] 1.2 `frontend/src/flows.spec.ts`: 回归测试——任何源文件都不许从 element-plus 根包引组件

## 2. 验证

- [x] 2.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 2.2 浏览器实测：不先进导入页，直接在「我的简历」点「重新导入」，确认框居中、有遮罩、标题与正文都在
