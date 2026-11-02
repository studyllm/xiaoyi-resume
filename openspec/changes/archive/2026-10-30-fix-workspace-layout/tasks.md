## 1. 滚动归属

- [x] 1.1 `frontend/src/layouts/DefaultLayout.vue`：内层容器加 `min-height: 0`，让 flex 分配的高度真正生效
- [x] 1.2 同文件：侧栏加 `min-height: 0` 与 `overflow-y: auto`，内容多时自己滚
- [x] 1.3 同文件：内容区加 `min-height: 0`，溢出由内容区承接而不是整个页面
- [x] 1.4 同文件：去掉内容区的内边距，间距统一由各页面自己管

## 2. 页头与内容对齐

- [x] 2.1 `frontend/src/styles/tokens.css`：新增 `--paper-width`，作为纸宽的唯一来源
- [x] 2.2 `frontend/src/components/ResumePreview.vue`：纸宽改用变量
- [x] 2.3 `frontend/src/styles/main.css`：新增 `.page-header--paper`，让页头与纸同宽并居中
- [x] 2.4 `frontend/src/views/DraftView.vue`、`DiagnosisView.vue`：页头用上 `.page-header--paper`

## 3. 验证

- [x] 3.1 `npm run type-check`、`npm test`、`npm run build` 全部通过
- [x] 3.2 浏览器实测：逐页确认「页头左边缘」与「内容左边缘」差值为 0，纸面页的右边缘也一致
- [x] 3.3 浏览器实测：在内容区滚动后 `window.scrollY` 保持 0，内容区自身滚动；侧栏内容超出时侧栏自己滚
- [x] 3.4 回归：落地页仍可整页滚动；打印页不受影响
