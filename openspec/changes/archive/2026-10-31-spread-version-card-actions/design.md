## Context

上一轮把操作按钮跟生成时间左对齐了，但四个按钮仍然全部挤在左边，卡片右边空出一大块。

## Goals / Non-Goals

**Goals:**

- 操作按钮在这一行里均分
- 第一个按钮跟生成时间贴左，最后一个（删除）贴右

**Non-Goals:**

- 不改按钮本身
- 不改纸面上的删除入口

## Decisions

### D1 用 space-between 均分

```css
.version-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  /* 按钮在这一行里均分，删除落在最右 */
  justify-content: space-between;
  margin-top: 6px;
}
```

flex 的 `space-between` 把剩余空间均分到按钮之间，两端贴边。按钮自身的内边距已经在上一轮归零，所以贴边的是图标本身。

**为什么删除落到最右**：破坏性操作与其它操作分开，是这类卡片常见的排法。

**为什么不是 space-around**：那会在两端也留出空隙，第一个按钮就不再跟生成时间对齐了。

## Risks / Trade-offs

- **[按钮之间的空隙变大]** → 卡片最窄 320px 时每个间隔约 39px，够点；窄卡片里若按钮换行，flex 会退回左对齐并均分行内空间

## Migration Plan

纯样式改动，无数据迁移。回滚即还原。

## Open Questions

- 无
