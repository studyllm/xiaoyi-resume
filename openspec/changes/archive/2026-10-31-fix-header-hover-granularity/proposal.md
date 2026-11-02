## Why

编辑模式下鼠标放到个人基础信息（抬头）上，**整块底色都变成"选中"的颜色**，而纸面其它地方只亮一行。

实测（读 `getComputedStyle` 的背景色）：

```
静止：          抬头 ink-80(241,242,244) | 条目头 ink-80 | 要点行 ink-80
悬停姓名：      抬头 brand-soft(231,241,240) ← 整块四行全变
                姓名行/定位行 透明（靠父块底色）
                条目头 ink-80 | 要点行 ink-80
悬停一条要点：  抬头 ink-80 | 条目头 ink-80 | 要点行 brand-soft ← 只有那一行
```

根因在 `frontend/src/components/resume-editor.css` —— 上一轮加编辑态标记时，hover 加深挂在**块**上：

```css
.resume-editor.is-editable :deep(.paper-header:hover),
.resume-editor.is-editable :deep(.paper-item-head:hover),
.resume-editor.is-editable :deep(.paper-bullets li:hover) {
  background: var(--brand-soft);
}
```

条目头是一行、每条要点是一行，块 = 行，hover 天然只亮一行；抬头这个块里装着姓名、一句话定位、手机、邮箱四行内容，hover 任意一处整块都变。粒度不一致，看着就像"整块被选中"。

## What Changes

抬头的 hover 细到行：淡底块保留（抬头仍是一整块），hover 加深只落在鼠标所在的那一行或那一小块。

```
静止：
┌▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┐
│ 张三                              │
│ 前端工程师 · 6 年经验               │
│ 手机    138-0000-0000    邮箱 …       │
└▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┘

鼠标移到「张三」：
┌▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┐
│▓张三▓                             │  ← 只有这行变淡青
│ 前端工程师 · 6 年经验               │
│ 手机    138-0000-0000    邮箱 …       │
└▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┘
```

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-visual-language`: 「纸面上能改的地方看得出来」补上「悬停反馈只落在所在的那一块」

## Impact

**代码**

- `frontend/src/components/resume-editor.css`：抬头从块级 hover 里摘出来，改成按行/按小块的 hover

**不受影响**

- 不改抬头的淡底块（仍是一整块）
- 不改字段的虚线、聚焦环与其它交互
- 不改条目头与要点的 hover 行为
- 不新增依赖
