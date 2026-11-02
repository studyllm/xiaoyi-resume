## Why

版本卡片上的操作按钮没有跟生成时间左对齐。

生成时间是卡片内容区左边缘上的普通文字，而操作按钮是 Element Plus 的 `el-button`——它自带一段左内边距，于是第一个按钮的图标比「生成于」这三个字往右缩了 11px。卡片下面两行看着就不在一条竖线上。

## What Changes

卡片底部的操作按钮行：把按钮自身的左右内边距归零，图标、文字与生成时间都从卡片内容区的左边缘起排；按钮之间的间距由 flex 的 gap 统一给（组件库自带 `.el-button + .el-button` 的 12px，gap 只补剩下的 4px，视觉间距 16px）。

实测：生成时间左边界 297，第一个图标左边界 297，差值 0；按钮间隔 16 / 16 / 16。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `version-management`: 「版本列表展示底稿入口与全部版本」——补上「操作按钮与生成时间左对齐」

## Impact

**代码**

- `frontend/src/views/VersionsView.vue`：操作按钮行的内边距与间距

**不受影响**

- 不改按钮的行为、文案与图标
- 不改卡片其它部分的排布
- 不新增依赖
