## Context

卡片底部的两行——「生成于 …」和操作按钮——本该从同一条左边缘起排，但按钮是 Element Plus 的 `el-button`，自带左内边距，第一个按钮的图标因此比时间文字往右缩了 11px。

## Goals / Non-Goals

**Goals:**

- 操作按钮的第一个图标与生成时间的文字左边缘对齐
- 按钮之间的间距一致

**Non-Goals:**

- 不改按钮本身的行为、文案与图标
- 不改纸面上的删除入口（那处只有一个按钮，没有同排对齐问题）

## Decisions

### D1 把按钮的内边距归零，间距交给 flex

```css
.version-card-actions {
  display: flex;
  align-items: center;
  /* 组件库自带 .el-button + .el-button 的 12px 间距，这里只补上剩下的 */
  gap: 4px;
  margin-top: 6px;
}

.version-card-actions :deep(.el-button) {
  padding-left: 0;
  padding-right: 0;
}
```

按钮自身的内边距归零后，图标就从容器左边缘起排，和时间文字对齐。按钮之间的视觉间距变成 gap(4) + 组件库的相邻按钮外边距(12) = 16px，与改动前一致。

**为什么不用负 margin 抵消**：负 margin 是为了绕开组件库的内边距，值写死（-11px）之后组件库一改版就错位；归零更直白。

**为什么纸面上的删除入口不改**：那里每个条目只有一个删除按钮，没有同排的邻居要对齐；而且它的内边距归零后图标会更靠左，贴着文字反而挤。

## Risks / Trade-offs

- **[按钮之间的视觉间距变紧]** → gap 补上了组件库那 12px 的差值，实测 16px，与改动前一致
- **[图标紧贴卡片内容区左边缘]** → 与生成时间对齐是这一轮要的效果

## Migration Plan

纯样式改动，无数据迁移。回滚即还原。

## Open Questions

- 无
