## 1. 设计变量层

- [x] 1.1 新增 `frontend/src/styles/tokens.css`：墨色梯度、纸面与桌面、主色与语义色、字体栈、字号、圆角、阴影、间距
- [x] 1.2 同文件：用 `html:root` 覆盖 Element Plus 的主色阶梯（primary / primary-rgb / light-3~9 / dark-2）与圆角、阴影变量，保证与样式加载顺序无关
- [x] 1.3 `frontend/src/styles/main.css`：改为引用变量，移除写死的颜色
- [x] 1.4 全部 `frontend/src/` 下的 `.vue` 与 `.css`：把硬编码的颜色、圆角、阴影收进变量（当前 66 处）
- [x] 1.5 `frontend/src/components/ResumePreview.vue`：纸面字体改为衬线栈，字号改用 pt
- [x] 1.6 `frontend/src/components/DiagnosisComment.vue`、`CommentSidebar.vue`：严重度色改用语义变量；低severity 由靛蓝改为板岩灰
- [x] 1.7 新增测试：扫描 `src/` 下所有视觉字面量，除 `tokens.css` 外一律失败

## 2. 交互规范

- [x] 2.1 `frontend/src/views/DraftView.vue`：删除条目与删除要点的操作改为悬停该行才出现
- [x] 2.2 `frontend/src/views/VersionsView.vue`、`VersionDetailView.vue`：破坏性操作同样改为悬停才现
- [x] 2.3 全局：主操作实心主色且每页至多一个；次操作文字按钮；危险操作文字加危险色
- [x] 2.4 `frontend/src/layouts/DefaultLayout.vue`：演示模式提示从全宽警告条改为顶栏下方细色带加侧栏底部小字
- [x] 2.5 同文件：侧栏菜单按「工作 / 交付」分组

## 3. 纸面为主角

- [x] 3.1 `frontend/src/views/DraftView.vue`：分区页签改成长纸；抬头、条目、要点在纸上就地编辑（静态渲染 + 点选后行内输入，不与响应式双向绑定）
- [x] 3.2 同文件：左侧新增分区目录（分区名 + 条目数），点击滚动到纸上对应位置
- [x] 3.3 同文件：右侧接入批注栏，批注与纸并排；「去修改」跳转后展开对应批注并获得焦点
- [x] 3.4 `frontend/src/views/DiagnosisView.vue`：与编辑页统一为同一套布局，纸明确为只读
- [x] 3.5 `frontend/src/views/VersionsView.vue`：表格改卡片，每张卡片含名称、JD 摘要、生成时间、底稿修订号与操作
- [x] 3.6 `frontend/src/views/WelcomeView.vue`：首屏左侧改为样例简历的纸面渲染，右侧挂几条批注
- [x] 3.7 窄屏（< 1280px）下批注栏折叠为图标条，纸保持 A4 宽度并允许横向滚动

## 4. 验证

- [x] 4.1 `npm run type-check`、`npm test`、`npm run build` 全部通过
- [x] 4.2 浏览器走查：顶栏、编辑页、诊断页、版本列表、落地页的视觉一致性；破坏性操作默认不可见；菜单分组；纸与批注并排
- [x] 4.3 导出 PDF 核对：纸面字体为衬线、颜色与预览一致、文字层完好
- [x] 4.4 回归：诊断规则、覆盖分级、排序护栏、删减闸门、措辞变换与不变量校验一字未改
