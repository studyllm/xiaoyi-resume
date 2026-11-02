## 1. 条目头的宽度分工

- [x] 1.1 `frontend/src/components/ResumePreview.vue`：条目头在编辑模式下加 `is-editable` 态，公司与职位 `flex: 1 1 0` 且 `min-width: 0`，时间块 `flex: 0 0 auto` 并靠右
- [x] 1.2 同文件：编辑态下公司与职位里的输入框铺满各自栏位
- [x] 1.3 `frontend/src/views/DraftView.vue`：时间选择器宽度收到 88px，不再用组件库默认的 220px
- [x] 1.4 预览模式的版式不变

## 2. 专业技能分区

- [x] 2.1 `frontend/src/components/ResumePreview.vue`：专业技能分区不渲染公司、职位与时间字段
- [x] 2.2 `frontend/src/views/DraftView.vue`：新增技能落在已有技能条目的技能行上，不新建条目；焦点落在新技能行上
- [x] 2.3 同视图：技能分区去掉条目末尾重复的「新增一条要点」，只留分区末尾的「新增一条技能」
- [x] 2.4 同视图：空技能行显示「点此写一条技能」的占位
- [x] 2.5 同视图：删掉或清空最后一条技能行后，一并清掉空条目

## 3. 验证

- [x] 3.1 补单测：专业技能分区不出现公司与职位字段；新增技能落在技能行上且不新建条目
- [x] 3.2 `npm run type-check`、`npm test`、`npm run build` 全部通过
- [x] 3.3 浏览器实测：公司与职位宽度、时间块宽度与间隔；专业技能分区只有技能行；新增技能的落点与焦点；预览模式未受影响
