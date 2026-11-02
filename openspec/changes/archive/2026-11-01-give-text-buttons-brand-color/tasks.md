## 1. 文字按钮的主色与悬停反馈

- [x] 1.1 `frontend/src/styles/main.css`: 新增覆盖规则——文字按钮的常态文字是 `--brand`，悬停时底色是 `--brand-soft`；排除破坏性确认与纸面删除入口；用 `html` 提高特异性让覆盖与样式加载顺序无关
- [x] 1.2 `frontend/src/styles/main.css`: 确认既有的 `.paper-delete` 规则仍然生效——删除入口淡灰常显、悬停转警示色，不被新规则改掉

## 2. 链接与按钮的区分

- [x] 2.1 `frontend/src/components/ResumeEditor.vue`: 不动，确认纸面上的破坏性确认按钮（`text type="danger"`）仍是红色
- [x] 2.2 `frontend/src/views/DraftView.vue`: 不动，确认编辑页「去诊断」这个链接在悬停时仍有下划线

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：诊断页「清空诊断结果」是主色字、悬停有淡青底；批注卡片三个动作都是主色字；版本卡片前三个动作是主色字、删除仍淡灰；纸面删除入口淡灰常显、悬停转红；「确认删除？」仍是红色；编辑页「去诊断」链接悬停有下划线而旁边的文字按钮没有
- [x] 3.3 浏览器实测：对话框的「留在本页」与侧栏的折叠箭头按统一规则变主色，确认看着不跳——两者都不需要单独排除
- [x] 3.4 生产构建实测：`npm run build` 后用 `npm run preview` 验证，打包后的 CSS 顺序对规则有利，同时 `html` 前缀保证与顺序无关；文字按钮仍是主色，纸面删除入口仍是淡灰
