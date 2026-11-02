## 1. 编辑态的视觉标记

- [x] 1.1 `frontend/src/components/ResumeEditor.vue`: 根节点按 `editable` 加 `is-editable` 状态类
- [x] 1.2 `frontend/src/components/ResumeEditor.vue`: 要点文字的 hover 底色交给整行接管，删掉单条的 hover 底色；text 光标收进编辑态
- [x] 1.3 `frontend/src/components/resume-editor.css`: 淡底块——抬头、条目头、每条要点；静止 `--ink-80`，悬停 `--brand-soft`
- [x] 1.4 `frontend/src/components/resume-editor.css`: 虚线字段——姓名、一句话定位、公司、职位、起止时间、联系方式；`text-decoration: underline dashed`，悬停变主色实线
- [x] 1.5 `frontend/src/components/resume-editor.css`: 聚焦环 `--shadow-focus`（`:focus-within`），正在编辑的 textarea 与键盘焦点（`:focus-visible`）都要看得见
- [x] 1.6 `frontend/src/components/resume-editor.css`: 纸面外围一圈极淡虚线（`outline` + `outline-offset` 内缩，不占空间）
- [x] 1.7 `frontend/src/components/ResumePreview.vue`: 打印样式里复位这些标记

## 2. 测试

- [x] 2.1 `frontend/src/components/ResumeEditor.spec.ts`: 编辑模式根节点带 `is-editable`，只读模式不带
- [x] 2.2 `frontend/src/components/ResumeEditor.spec.ts`: 读 `resume-editor.css` 断言淡底块、虚线字段、聚焦环、外圈这四类规则都在
- [x] 2.3 `frontend/src/components/ResumePreview.spec.ts`: 打印规则里编辑标记被复位

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：编辑模式下淡底块、虚线字段、外圈都在；hover 与聚焦有反馈；预览模式与打印稿一点标记都没有
