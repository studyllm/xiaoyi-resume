## 1. 认出表格

- [x] 1.1 `packages/shared/src/engines/parseDraft.ts`：加列标题行识别——不含日期、不带项目符号、由三个以上空格分隔的短词组成，且下一行含日期
- [x] 1.2 `packages/shared/src/engines/parseDraft.ts`：表格模式——该分区剩下的行不切条目，内容进「其它」分区；表格标题从上一条的要点里摘下来
- [x] 1.3 `packages/shared/src/engines/parseDraft.spec.ts`：表格不被切成碎片条目、内容原样保留；普通要点不被误判成表格

## 2. 验证

- [x] 2.1 `packages/shared`: `npm run test` 全绿
- [x] 2.2 **那份 PDF 当回归样本**（`资深 Java 后端工程师 (12年经验).pdf`）：结构问题只剩 1 条 low，界面��看不到
- [x] 2.3 仓库根：`npm run verify` 全绿
