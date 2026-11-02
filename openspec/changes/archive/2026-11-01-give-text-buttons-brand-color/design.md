## Context

上一轮把 51 个按钮的形态与尺寸统一了，但形态统一之后暴露出 Element Plus 文字按钮的默认行为不适合这个产品。

实测（浏览器计算样式）：

```
默认文字按钮（el-button text）
  常态   color rgb(61,67,77)   ← --ink-700，与正文同色
  悬停   color rgb(61,67,77)   ← 不变
         bg    rgb(247,248,249) ← 只多一层几乎看不见的淡灰

text type="primary"
  常态   color rgb(15,118,110) ← 松墨青
```

颜色不变的原因是层叠顺序，不是配置：

```css
.el-button:hover      { color: var(--el-button-hover-text-color) }  /* 特异性 0,2,0 */
.el-button.is-text    { color: var(--el-button-text-color) }        /* 特异性 0,2,0，但在后面 */
```

同特异性后定义者胜，所以 `.is-text` 的常态色盖掉了 `.el-button:hover` 的悬停色。Element Plus 自带的 `bg` 属性（文字按钮常驻淡底）项目里没用过，而且一排按钮各带一块常驻底色太重。

`--el-button-text-color` 由 `type` 决定：primary 是松墨青，默认是 `--el-text-color-regular`。所以项目里 2 个青色文字按钮、20 个灰色，同一排里颜色不统一。

下划线不来自按钮，来自 `el-link`：`.el-link.is-hover-underline:hover:after` 画一条 1px 底边。项目里两个 `el-link`——编辑页的「去诊断」与版本列表的版本名。

## Goals / Non-Goals

**Goals:**

- 文字按钮一眼看得出是可点的。
- 文字按钮之间颜色统一。
- 悬停有明确反馈。
- 链接与按钮仍然分得清。

**Non-Goals:**

- 不改任何按钮的文案、行为、尺寸、层级。
- 不改实心主色按钮。
- 不改链接的颜色。
- 不改纸面上的删除入口与破坏性确认——它们各有各的规格。
- 不引入新的按钮组件。

## Decisions

### 决策一：改变量而不是直接写 color

覆盖规则写在 `main.css`：

```css
html .el-button.is-text:not(.el-button--danger):not(.paper-delete) {
  --el-button-text-color: var(--brand);
}

html .el-button.is-text:not(.is-disabled):not(.el-button--danger):not(.paper-delete):hover {
  background-color: var(--brand-soft);
}
```

**为什么改变量**：Element Plus 的按钮状态规则全挂在变量上，直接写 `color` 会跟它们逐一打架。改变量则让每种状态各自已有的规则原样生效：

| 状态 | 谁决定颜色 | 结果 |
| --- | --- | --- |
| 常态 | `.el-button.is-text{color:var(--el-button-text-color)}` | 主色 |
| 悬停 | 同上（特异性高于 `.el-button:hover`） | 保持主色 |
| 禁用 | `.el-button.is-text.is-disabled` | 保持禁用灰 |
| 纸面删除 | `.paper-delete.el-button.is-text`（既有规则） | 保持淡灰，悬停转警示色 |
| 破坏性 | `.el-button--danger.is-text` | 保持红色 |

**为什么用 `html` 提高特异性**：组件库按需引入时 CSS 先后不可控（`tokens.css` 里覆盖主色时已经踩过这个坑，用的是 `html:root`）。`html` 前缀让这两条规则无论先后都赢。

### 决策二：淡青底与纸面用同一个色

悬停底色用 `--brand-soft`（#e7f1f0），不是 Element Plus 默认的 `--el-fill-color-light`（#f7f8f9 中性灰）。纸面上「可编辑块悬停」用的就是 `--brand-soft`，界面上按钮悬停也用同一个色，两套交互反馈是同一种语言。

### 决策三：破坏性确认与纸面删除入口排除在外

- `text type="danger"`（纸面的「确认删除？」×3）保持红色。破坏性操作本来就该跟普通动作长得不一样。
- `.paper-delete`（纸面与版本卡片的垃圾桶图标）保持淡灰常显、悬停转警示色。这是既有规格写定的规则——「删除入口统一用垃圾桶图标，淡色常显，悬停才变警示色」。

两者都靠 `:not()` 排除，不靠另写覆盖。

### 决策四：链接保留下划线

链接是「跳到别处」，按钮是「在这里做事」。既然两者现在都是主色，下划线就成了唯一的区分标志，所以保留 `el-link` 的悬停下划线，不做全局关闭。

代价：链接在静止状态下没有下划线，只有悬停才出现。项目里只有两个链接（编辑页的「去诊断」与版本列表的版本名），都能接受。

### 决策五：对话框与侧栏的折叠箭头不另设例外

- 对话框的「留在本页」是文字按钮，改成主色。它与旁边的实心主色「保存并离开」同属一个品牌色，一实一虚，是协调的而不是冲突的。实测后确认它不抢戏。
- 侧栏的折叠箭头也是文字按钮，改成主色。批注栏收起时它是唯一的展开入口，主色反而让这个入口更显眼。实测后确认不跳。

两处先按统一规则走，实现后用浏览器看一眼再定要不要单独排除——**实测结果是都不需要排除**。

## Risks / Trade-offs

- **版本卡片会有三个主色字连排**（打开、复制纯文本、导出 PDF）。这是"全主色"的必然结果，删除入口保持淡灰，那一排仍能分出主次——但比之前吵。纸面上那种克制感在卡片里会弱一些。
- **主色用多了就不再是"强调"**。规格写的是「主色 SHALL 用于可操作的元素」，本轮把这句话落到实处，但同时也意味着主色不再稀缺。
- **改的是变量不是属性**，所以 Element Plus 升级时如果改了变量名，这两条规则会一起失效——不会报错，只是文字按钮悄悄变回灰色。
- **不写守卫测试**。CSS 的实际效果静态扫描测不到；在测试里断言一段 CSS 字符串存在，等于给未来的人制造"改了样式测试也不报"的假安全感。靠浏览器验收。
