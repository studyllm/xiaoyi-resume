## 1. 领域模型

- [x] 1.1 `domain/types.ts`：`SectionKind` 加 `'other'`；`SECTION_ORDER` 末尾加 `'other'`；`SECTION_TITLES.other = '其它'`
- [x] 1.2 `domain/types.ts`：加「没有条目头的分区」清单 `SECTIONS_WITHOUT_ITEM_HEAD = ['skills', 'other']`，供界面与诊断统一判断，不再各自堆 `kind !== 'skills'`
- [x] 1.3 `domain/sectionFields.ts`：`SECTION_FIELD_WORDS.other` —— 没有机构名与职位，词与专业技能一致

## 2. 解析

- [x] 2.1 `engines/parseDraft.ts`：表头关键词加「其它」一组（自我评价、获奖经历、荣誉奖项、证书、语言能力、社团经历、志愿服务、个人评价、实习项目、校园经历、专业认证、培训经历 + Personal Summary、Self Evaluation、Awards、Certificates、Profile、Publications、Volunteer Experience、Interests、Activities）
- [x] 2.2 两处 `buckets` 加上 `other`
- [x] 2.3 「其它」为空时不产生「分区没有识别到内容」的警告
- [x] 2.4 置信度只看四个必填分区，填满才算 1
- [x] 2.5 **删掉基于长度的「疑似表头」启发式**——它对 4 字普通要点 12/12 误判，既不能用于路由也不适合用于告警
- [x] 2.6 `engines/types.ts`：`ParseResult` 的 `suspectedHeaders` 语义改为「被放进其它分区的表头」

## 3. 诊断

- [x] 3.1 `engines/structure.ts`：「其它」分区不查缺机构名、缺职位、缺开始时间，不查时间线顺序
- [x] 3.2 `engines/structure.ts`：「其它」为空时不报「分区为空」

## 4. 界面

- [x] 4.1 `components/ResumePreview.vue`：`showFields` 改问「没有条目头的分区」而不是硬编码 skills
- [x] 4.2 `components/ResumeEditor.vue`：同上的四处 skills 特例改用统一判定；`SECTION_ADD_LABELS.other` 的措辞
- [x] 4.3 `components/ResumeEditor.vue`：`addEntry` 对「其它」落在内容行上（与专业技能一致）
- [x] 4.4 `views/ImportView.vue`：提示改成「这份简历有 N 段我们不确定属于哪个分区，放在『其它』里了」，列出是哪几段
- [x] 4.5 `views/WelcomeView.vue`：落地页「四个分区」文案改为包含「其它」

## 5. 版本与存档

- [x] 5.1 `engines/generateVersion.ts`：只为底稿里存在的分区生成版本分区，避免老版本多出空的「其它」
- [x] 5.2 `stores/persistence.ts`：分区种类表加 `'other'`，与 `SECTION_ORDER` 保持一致；确认旧存档读出来不变

## 6. 测试

- [x] 6.1 `parseDraft.spec.ts`：分区顺序断言补 `'other'`；「自我评价」进其它分区的用例；原来断言「自我评价」是疑似表头的那条要换成另一个词
- [x] 6.2 `stores/draft.spec.ts`：干净简历的诊断仍是零意见（空「其它」不报）
- [x] 6.3 新增：「其它」分区有内容时结构检查不报缺字段；空「其它」不报分区为空
- [x] 6.4 新增：存档往返——含 `kind: 'other'` 的底稿读回来 kind 不变；旧存档（四个分区）读回来不变
- [x] 6.5 新增：版本生成不为底稿里没有的分区产出空分区
- [x] 6.6 `npm run verify` 全绿

## 7. 文档

- [x] 7.1 `CLAUDE.md` §4.3：「其余是四个分区」改为五个
- [x] 7.2 `docs/v0.1-产品需求文档.md` §7.1：「至少包含：教育、经历、项目、技能」补上其它
- [x] 7.3 `docs/产品开发计划-v1.0.md`：已知限制里「加第五个分区是产品决策」更新为已完成

## 8. 浏览器验收

- [ ] 8.1 上传一份带「自我评价」「获奖经历」的简历，确认它们出现在「其它」分区且没有并进工作经历
- [ ] 8.2 确认「其它」分区在纸面上是内容行、没有机构名与时间
- [ ] 8.3 确认提示给出正确的段数并列出是哪几段
- [ ] 8.4 确认没有「其它」分区时，提示不出现、诊断不多出意见、置信度仍是 100%

## 9. 归档

- [ ] 9.1 归档本变更
- [ ] 9.2 确认生效规格的 Purpose 未受影响
