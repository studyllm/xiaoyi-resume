## Why

两个工作台的布局问题让页面显得"没做完"。

**一、内容区滚动会带动整个页面。** 根因是 flex 子项的 `min-height` 默认是 `auto`——意思是"不低于内容高度"。外层容器虽然是 `height: 100%`，但内层容器作为它的 flex 子项被内容顶开，撑破容器后溢出跑到 body 上，最后滚动的是整个页面，内容区反而滚不动（因为它长得和内容一样高）。

**二、纸面两页的页头没有和纸对齐。** 「我的简历」和「简历诊断」承载的是一张 794px 的纸，页头却是左对齐在内容区边缘的，纸是居中的——标题和纸的左边缘差了 47px，看起来像两张没对齐的版。其余页面没有这个问题，因为它们的页头和内容都在同一个 `.page` 容器里。

两处都是纯布局问题，不涉及业务行为，但都属于用户一眼能看出来的粗糙。

## What Changes

**滚动归属**

```
.layout-body  { flex: 1; min-height: 0; }        ← 解除"不低于内容高度"的隐式约束
.layout-aside { min-height: 0; overflow-y: auto; } ← 侧栏自己滚
.layout-main  { min-height: 0; overflow-y: auto; } ← 内容区自己滚
```

`min-height: 0` 是关键：它让 flex 分配的高度真正生效，溢出被关进 `overflow-y: auto` 的容器里，而不是跑到 body 上。

顺带修掉一处重复内边距：`layout-main` 与 `.page` 各加了一层 padding，顶部实际有 40px。因为每个页面都自带内边距，去掉 `layout-main` 的那一层。

**页头与内容共用框架**

把纸的宽度提成变量 `--paper-width`，纸面页的页头与纸同宽并居中：

```
┌──────────┬────────────────────────────────┐
│ 侧栏      │  我的简历  [修订号][预览|编辑]     │ ← 与纸同宽同位
│  200      │ ┌──────────────┐ ┌──────────┐ │
│           │ │     纸 794   │ │ 批注 320  │ │
│           │ └──────────────┘ └──────────┘ │
└──────────┴────────────────────────────────┘
```

统一后的规则：**页头与它下方的内容共用同一个横向框架，两者的左边缘对齐**。承载纸面的页面用纸的宽度，其余页面用它们的内容容器宽度。

## Capabilities

### New Capabilities

- `workspace-layout`: 工作台滚动的归属（只滚内容区，侧栏独立滚），以及页头与下方内容共用横向框架

### Modified Capabilities

无。

## Impact

**代码**

- `frontend/src/layouts/DefaultLayout.vue`：内层容器加 `min-height: 0`，侧栏与内容区各自可滚，去掉重复内边距
- `frontend/src/styles/tokens.css`：新增 `--paper-width`
- `frontend/src/styles/main.css`：新增 `.page-header--paper`
- `frontend/src/components/ResumePreview.vue`：纸宽改用变量
- `frontend/src/views/DraftView.vue`、`DiagnosisView.vue`：页头用上 `.page-header--paper`

**不受影响**

- 不改任何业务逻辑、引擎、领域模型与存储结构
- 不新增依赖
