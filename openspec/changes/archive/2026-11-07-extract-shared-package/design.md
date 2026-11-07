## Context

`domain/` 与 `engines/` 是产品的核心：诊断规则、措辞变换、「不编造」的不变量校验都在 `engines/` 里。它们现在是纯函数、无 DOM 依赖（`ResumeEngines` 的五个方法全部满足），所以**能**被服务端直接引用——前提是它们不住在 `frontend/src/` 里。

## Goals / Non-Goals

**Goals:**

- 把共享的那份源码抽出来，让服务端能引用**同一份文件**。
- 包边界由工具链强制，不靠约定。
- 结构调整不改变任何行为。

**Non-Goals:**

- 不立 `server/`（那是下一步）。
- 不动引擎与领域的任何逻辑。
- 不改契约的内容（`docs/api-contract.md` 已冻结）。

## Decisions

### D1. 用包名解析，不用路径别名

`@xiaoyi/shared/domain/types` 由 npm workspace 解析。

**理由**：别名只是约定——服务端想引用前端的东西，加个别名就做到了。包名做不到：`server` 的 `package.json` 里没有 `@xiaoyi/frontend` 这个依赖，解析器直接报错。**边界要由解析器强制。**

**代价**：lockfile 必须移到根目录，CI 的安装步骤要改。一次性成本。

### D2. 共享包内部用相对路径

包内不引用自己的包名。

**理由**：包依赖自己会让「这个包能不能独立解析」变成一个含糊的问题。相对路径让包自洽——它可以被任何解析器直接读。

### D3. `pdfText.ts` 留在前端，挪到 `frontend/src/pdf/`

pdf.js 是浏览器能力；P1 承诺过「文件在浏览器里解析，不会上传到任何服务器」；它也不在 `ResumeEngines` 接口里。

**理由**：共享包的边界是「两端都要用的」。`pdfText` 只有前端用，放进去会让服务端装上 pdf.js 的依赖。

**顺带**：从 `engines/` 挪到 `pdf/`，是为了不让 `frontend/src/engines/` 变成只剩一个文件的怪目录。目录名本身说明了它为什么不共享。

### D4. 共享包的用例跟着源码走

vitest 的 `include` 加 `../packages/shared/src/**/*.spec.ts`。

**理由**：用例测的是共享的那份逻辑，跟着源码走才不会漏跑。**跑完要确认用例总数没变**——变了说明有测试被漏掉或重复计入。

### D5. lockfile 移到根目录

npm workspace 的依赖装在根 `node_modules`，lockfile 只能在根。

**连带**：`copy-pdfjs-assets.mjs` 原来从 `frontend/node_modules` 拷 pdf.js 资源，现在要改成「两个位置都找，找不到就报错」。

## Risks / Trade-offs

**[共享包的用例在 `frontend/` 的 vitest 根之外]** → vitest 的 `include` 用 `../` 跨目录，实测可用（35 个测试文件、540 个用例，与抽取前一致）。

**[Vite 的 fs.allow 会不会挡住 `packages/`]** → lockfile 移到根之后，Vite 认出的 workspace 根就是仓库根，`packages/` 在允许范围内。**如果 lockfile 留在 `frontend/`，Vite 会只认 `frontend/` 为根，`packages/` 就成了越界访问**——这正是 lockfile 必须移动的另一个理由。

**[包解析 vs 别名的性能差]** → 可忽略：解析只发生在构建期，产物里没有包名。

**[import 重写漏了一处就会白屏]** → 门禁四項（类型检查 + 两种跑法的测试 + 构建）全过才算完；类型检查会抓出所有漏掉的路径。

## Migration Plan

无数据迁移。lockfile 移位后 CI 要重新装依赖——第一次跑会慢一点，之后恢复。

## Open Questions

- `server/` 用什么运行时跑 TypeScript：Node 的类型剥离不认无扩展名的相对导入，要么给所有相对导入加 `.ts`，要么用 `tsx`。倾向 `tsx`。
