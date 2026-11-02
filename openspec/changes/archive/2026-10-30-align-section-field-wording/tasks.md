## 1. 分区词汇表

- [x] 1.1 新增 `frontend/src/domain/sectionFields.ts`：给出各分区的机构类字段、职位类字段与条目指代说法
- [x] 1.2 词汇表用 `Record<SectionKind, ...>` 约束，新增分区时类型检查报错

## 2. 编辑界面

- [x] 2.1 `frontend/src/views/DraftView.vue`：条目头的字段占位改用词汇表
- [x] 2.2 同视图：结构提醒里的"缺少什么"改用词汇表

## 3. 诊断意见

- [x] 3.1 `frontend/src/engines/diagnose.ts`：`missing-org` 与 `missing-title` 的文案按分区生成
- [x] 3.2 规则本身不变：仍然是有机构类字段没机构类字段就报 `missing-org`，项目不报 `missing-title`

## 4. 验证

- [x] 4.1 补单测：教育背景的字段问学校与专业；工作经历问公司与职位；诊断意见按分区措辞
- [x] 4.2 `npm run type-check`、`npm test`、`npm run build` 全部通过
- [x] 4.3 浏览器实测：新增教育经历后是「学校名称 / 专业」；工作经历「公司名称 / 职位」；项目经历「项目名称 / 角色」
