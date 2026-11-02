## Why

版本卡片底部的操作按钮虽然左对齐了，但四个按钮挤在左边，右边空一大块——卡片看起来没排满。

## What Changes

操作按钮在这一行里均分：第一个跟生成时间对齐（贴左），最后一个（删除）落在最右，中间的按钮均匀分布。

```
生成于 2026-10-31 22:38
👁 打开        📋 复制纯文本        ⬇ 导出 PDF        🗑
 ↑ 贴左                                          ↑ 贴右
```

实测：第一个按钮左边界与生成时间左边界都是 297（差值 0），最后一个按钮右边界与内容区右边界都是 610，按钮之间的间隔 39 / 39 / 39。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `version-management`: 「版本列表展示底稿入口与全部版本」——操作按钮在这一行里均分，删除落在最右

## Impact

**代码**

- `frontend/src/views/VersionsView.vue`：操作按钮行加 `justify-content: space-between`

**不受影响**

- 不改按钮的行为、文案与图标
- 不改卡片其它部分的排布
- 不新增依赖
