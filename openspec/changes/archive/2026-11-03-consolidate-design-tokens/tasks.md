## 1. 设计变量扩充

- [x] 1.1 `styles/tokens.css` 补界面刻度：`--space-hair`（1px）、`--space-3xs`（2px）、`--space-3xl`（48px）、`--text-2xs`（11px）、`--text-md`（15px）
- [x] 1.2 `styles/tokens.css` 补纸面刻度：`--paper-text-xs/sm/base/md/lg`（9.5/10.5/11/12/18pt）、`--paper-space-hair/xs/sm/md/list/lg/indent/xl/page`
- [x] 1.3 `--paper-space-list: 5mm` 与 `--paper-space-indent: 9mm` 单独留档——要点的对齐关系依赖它们，归并会断掉对齐

## 2. 尺寸收敛

- [x] 2.1 全量样式文件里 `font-size` / `border-radius` / `padding` / `margin` / `gap` 及其长写形式的 px、pt、mm 全部改为变量
- [x] 2.2 纸面的 pt 与 mm 用 `--paper-*`，界面的 px 用 `--space-*` / `--text-*` / `--radius-*`
- [x] 2.3 负值用 `calc(-1 * var(--token))`
- [x] 2.4 几何尺寸（width / height / top / left / border-width / outline）不动
- [x] 2.5 **归并不能破坏对齐**：列表缩进 + 条目缩进 = 新增按钮的缩进，三者改完仍相等

## 3. 守卫推广

- [x] 3.1 `flows.spec.ts` 里那条只扫落地页的 px 规则改成扫全量样式文件（.vue 取 `<style>` 块，.css 取全文）
- [x] 3.2 守卫只禁 px——纸面的 pt 与 mm 是合法的物理尺寸表达
- [x] 3.3 删掉因此不再被用到的 `landingStyle()` helper
- [x] 3.4 守卫的注释更新：不再是「只扫落地页」

## 4. 测试同步

- [x] 4.1 `ResumeEditor.spec.ts` 的样式断言改读新位置（`editorStyles()` 同时读 `tokens.css` 与四个组件）
- [x] 4.2 断言「新增按钮与要点文字对齐」时，把对齐关系与数值一起断言
- [x] 4.3 `npm run verify` 全绿，用例数量不减

## 5. 验证

- [x] 5.1 逐项核对位移清单：48 处有变化、其余 93 处零变化，且都在 4px / 1mm 以内
- [x] 5.2 **浏览器验收**：编辑页与诊断页逐处对照改动前——纸面、批注栏、侧栏目录、弹窗的间距与字号；导出 PDF 的版式
- [x] 5.3 确认纸面要点的缩进对齐没断（列表 5mm + 条目 4mm = 按钮 9mm）

## 6. 归档

- [x] 6.1 归档本变更
- [x] 6.2 确认 `product-visual-language` 的 Purpose 未受影响
