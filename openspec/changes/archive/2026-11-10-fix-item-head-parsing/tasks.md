## 1. 机构名靠形态词认

- [x] 1.1 `packages/shared/src/engines/parseDraft.ts`：加机构形态词表；`splitOrgTitle` 里带形态词的片段是机构名，其余是职位
- [x] 1.2 `packages/shared/src/engines/parseDraft.spec.ts`：职位并列在前、机构名在后 → 机构名与职位各归各位；机构名在前时照旧

## 2. 条目头被切成两半时合并日期

- [x] 2.1 `packages/shared/src/engines/parseDraft.ts`：一行只有日期、上一条缺结束日期、且补上的日期不早于开始日期 → 补成上一条的结束日期
- [x] 2.2 `packages/shared/src/engines/parseDraft.spec.ts`：条目头被切成两半 → 只有一条且结束日期正确；补上的日期更早时不合并

## 3. 验证

- [x] 3.1 `packages/shared`: `npm run test` 全绿
- [x] 3.2 **那份 PDF 当回归样本**（`资深 Java 后端工程师 (12年经验).pdf`）：结构问题从 14 条降到 4 条，剩下的全部来自「其他项目经历」那张表格
- [x] 3.3 仓库根：`npm run verify` 全绿
