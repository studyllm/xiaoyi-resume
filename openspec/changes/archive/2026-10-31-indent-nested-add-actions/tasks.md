## 1. 条目里的新增入口缩进

- [x] 1.1 `frontend/src/components/ResumeEditor.vue`: `#item-add` 的「＋ 新增一条要点」加 `paper-add--nested`；`#section-add` 不动
- [x] 1.2 `frontend/src/components/resume-editor.css`: `.paper-add--nested` 缩进 9mm、宽度 `calc(100% - 9mm)`，写在 `.paper-add` 之后

## 2. 测试

- [x] 2.1 `frontend/src/components/ResumeEditor.spec.ts`: 断言条目里的新增入口带 `paper-add--nested`、分区末尾的那个不带
- [x] 2.2 `frontend/src/components/ResumeEditor.spec.ts`: 读 `resume-editor.css` 断言 `--nested` 的缩进与宽度规则在

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：条目里的「＋ 新增一条要点」与要点正文左边缘对齐（相对版心 +34px）；分区末尾的与专业技能的「＋ 新增一条技能」仍在版心左边缘；预览模式不受影响
