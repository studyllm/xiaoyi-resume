## 1. 首尾相接不算重叠

- [x] 1.1 `packages/shared/src/domain/time.ts`：`rangesOverlap` 从 `<=` 改成 `<`——共用一个月不算重叠
- [x] 1.2 `packages/shared/src/domain/time.spec.ts`：那条「首尾相接算重叠」的用例改成新语义，补一条「共用两个月算重叠」

## 2. 解析时排好顺序

- [x] 2.1 `packages/shared/src/engines/parseDraft.ts`：解析完按开始时间倒序排；缺日期的排在后面；只排有条目头的分区
- [x] 2.2 `packages/shared/src/engines/parseDraft.spec.ts`：顺序、缺日期的排在后面

## 3. 标签认得出是哪儿

- [x] 3.1 `packages/shared/src/engines/structure.ts`：条目既没机构名也没职位时，标签用第一条要点的开头（截到 24 个字）
- [x] 3.2 `packages/shared/src/engines/structure.spec.ts`：那条用例断言标签是要点开头而不是「未命名的条目」

## 4. 验证

- [x] 4.1 `packages/shared`: `npm run test` 全绿
- [x] 4.2 **那份 PDF 当回归样本**（`资深 Java 后端工程师 (12年经验).pdf`）：「时间有重叠」与「没有按时间倒序」全部消失，剩下的标签都认得出是哪儿
- [x] 4.3 仓库根：`npm run verify` 全绿
