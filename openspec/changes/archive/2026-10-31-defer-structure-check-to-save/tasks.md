## 1. 纸面不再标注结构问题

- [x] 1.1 `frontend/src/components/ResumeEditor.vue`: 删掉 `#section-extra` 与 `#item-extra` 里的结构标注按钮
- [x] 1.2 `frontend/src/components/ResumeEditor.vue`: 删掉随之没用的代码——`structureFindings` / `structureBySection` / `structureByItem` / `focusStructure` / `structureLabel` / `structureSeverity` / `sectionStructure` / `itemStructure` / `focusSectionStructure` / `focusItemStructure`
- [x] 1.3 `frontend/src/components/ResumePreview.vue`: 删掉 `#section-extra` 与 `#item-extra` 两个插槽
- [x] 1.4 `frontend/src/components/resume-editor.css`: 删掉 `.paper-marker` 及其变体

## 2. 结构问题带上一句「该在哪个格补」

- [x] 2.1 `frontend/src/engines/structure.ts`: `StructureFinding` 增加 `field`，`missing-org` → `org`、`missing-title` → `title`、`missing-start` → `start`、`end-before-start` → `end`，其余没有
- [x] 2.2 `frontend/src/engines/structure.spec.ts`: 断言每条规则的 `field`

## 3. 编辑器能定位到条目与字段

- [x] 3.1 `frontend/src/components/ResumeEditor.vue`: `EditorFocusTarget` 改成可辨识联合，加 `item` 与 `field` 两种
- [x] 3.2 `frontend/src/components/ResumeEditor.vue`: 定位到 `field` 时滚到该条目并把光标放进对应的输入框

## 4. 保存时检查，清单列在右侧栏

- [x] 4.1 `frontend/src/stores/draft.ts`: 新增 `structureFindings` 内存态与 `checkStructure()`；`discardEdits()` 时清空
- [x] 4.2 `frontend/src/components/CommentSidebar.vue`: 新增 `structureFindings` prop 与 `locate` emit；侧栏顶部渲染结构问题清单；折叠态多一个计数
- [x] 4.3 `frontend/src/views/DraftView.vue`: `saveEdits()` 保存后跑一次检查，有问题就留在编辑模式，没有就切预览；Cmd/Ctrl+Enter 走同一条路径
- [x] 4.4 `frontend/src/views/DraftView.vue`: 侧栏接上结构问题清单；点某一条切到编辑模式并定位到那个字段
- [x] 4.5 `frontend/src/views/DraftView.vue`: 页头预览模式里的「N 处结构问题」去掉

## 5. 测试

- [x] 5.1 `frontend/src/components/ResumeEditor.spec.ts`: 删掉结构标注那两条；新增"定位到字段会把光标放进那个输入框"
- [x] 5.2 `frontend/src/components/CommentSidebar.spec.ts`: 新建——结构问题清单渲染、点击 emit `locate`、折叠态计数
- [x] 5.3 `frontend/src/views/DraftView.spec.ts`: 新增——保存后侧栏顶部出现清单、点清单定位到字段、没有结构问题时保存后切预览

## 6. 验证

- [x] 6.1 `frontend`: `npm run type-check` 与 `npm test` 全绿
- [x] 6.2 浏览器实测：编辑时纸面没有结构提示；新增教育经历不弹提示；保存后右侧栏出现清单；点清单跳到那个字段；补完再保存清单变短；预览模式纸面干净
