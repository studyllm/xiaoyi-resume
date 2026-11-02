## 1. 抬头的 hover 细到行

- [x] 1.1 `frontend/src/components/resume-editor.css`: 把 `.paper-header:hover` 从块级 hover 规则里摘掉
- [x] 1.2 `frontend/src/components/resume-editor.css`: 新增细到行的 hover——姓名行、一句话定位行、每个联系方式各自 hover 才变淡青；姓名与定位常驻一小段内边距，悬停时文字不位移

## 2. 测试

- [x] 2.1 `frontend/src/components/ResumeEditor.spec.ts`: 读 `resume-editor.css` 断言抬头不在块级 hover 规则里、且有细到行的 hover 规则

## 3. 验证

- [x] 3.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 3.2 浏览器实测：悬停姓名只有姓名那行变淡青；悬停「手机」只有手机那一组变；条目头与要点的行为不变；悬停时文字不位移
