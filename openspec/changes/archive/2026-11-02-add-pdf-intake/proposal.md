## Why

PRD §7.1 要求「支持上传 PDF，系统尽力解析成文本；解析失败或结果明显不可用时，把已得到的文本交给用户修改，不要求用户重新整理版式」，§9 验收第 2 条明写「PDF 能解析时得到可编辑底稿；不能解析时，用户仍能在文本上改完并保存」。

这是 v0.1 全部 12 条验收里**唯一还没通过**的一条，也是 v1.0 的发布硬阻断项。

现状是彻底占位：`ImportView.vue` 的「上传文件」页签只有一个拖拽区和一句「原型阶段暂不支持 PDF 解析」，不读文件、不产生任何底稿内容。而真实求职者手里拿到的几乎都是 PDF，不是纯文本——没有这条路径，产品对真实用户是不可用的。

## What Changes

- 导入页「上传文件」页签从占位改为真实入口：选文件、校验、提取文字层、进入与粘贴路径完全一致的解析流程
- 新增 `frontend/src/engines/pdfText.ts`：用 pdf.js 提取文字层，产出 `{ text, pageCount, quality, warnings }`
- **质量三态闸门**：`text-layer`（有完整文字层）/ `sparse`（能读到的文字很少，多半是扫描件）/ `none`（没有文字层）
- **降级链路**：`sparse` 仍把已提取到的文本交给用户并明确警告；`none` 明确告知并引导改用粘贴。两条路都不要求用户重新整理版式
- 文件校验：文件类型（按文件头字节判定，不信浏览器给的 MIME）、大小上限、页数上限、加密口令、文件损坏
- 新建能力域 `pdf-intake`；`resume-draft` 的「通过上传文件放入底稿（原型占位）」改为真实行为

不做 OCR。扫描件交给用户判断并手动补全——理由见 design.md。

## Capabilities

### New Capabilities

- `pdf-intake`: 上传 PDF 的摄入行为、提取结果的质量分档与各自的出路、文件校验与各类失败的处置、提取出的文字必须保持可被结构化解析。

### Modified Capabilities

- `resume-draft`: 「通过上传文件放入底稿（原型占位）」这条 requirement 的行为改变——不再是占位，改为真实解析，并接上「解析不了也给用户出路」的降级链路。

## Impact

- **新增依赖**：`pdfjs-dist@^6`（当前 6.5.438）。通过**动态 import** 引入，只在用户选文件时加载，不进主包
- **新增文件**：`frontend/src/engines/pdfText.ts` 及其单测；`frontend/src/mock/` 下补一份带文字层的样例 PDF 供人工验收
- **改动文件**：`frontend/src/views/ImportView.vue`（上传页签从占位改为真实入口）；`frontend/package.json`（加依赖与脚本）
- **不改**：`ResumeEngines` 接口、解析引擎 `parseDraft`、诊断引擎、版本生成链路。提取出的文本走现成的 `draftStore.ingest(rawText)`，与粘贴路径共用全部下游
- **引擎接口**：`pdfText` **不进** `ResumeEngines`——理由见 design.md 决策 2
- **无用户可见的破坏性变化**：粘贴路径的行为完全不变
