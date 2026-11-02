## Why

点「重新导入」弹出的确认框是坏的：只看得见「去导入简历」和「取消」两个按钮，框本身（遮罩、标题、正文）完全看不见，位置还跑到页面左上角。

实测（读 `getComputedStyle`）：

```
遮罩 .el-overlay   position: fixed ✓   background: rgba(0,0,0,0.5) ✓
弹窗 .el-message-box  position: static ✗  background: transparent ✗  display: block ✗
```

`.el-message-box` 的样式压根没加载——所以它按普通块级元素躺在页面左上角。

## What Changes

根因是 `frontend/src/views/DraftView.vue` 里的一行：

```ts
import { ElMessage, ElMessageBox } from 'element-plus'
```

从 **element-plus 根包**引组件，只拿到组件代码，拿不到组件的样式。仓库里其它地方用的是自动导入（`unplugin-auto-import` 的 ElementPlus 解析器），它会连带把 `element-plus/es/components/xxx/style/css` 一起引进来——所以导入页的弹窗是好的，只有从「我的简历」点进去的那次是坏的（那个页面没加载过导入页的样式）。

改成不显式引，交给自动导入：

```ts
// 不引了
```

自动导入会带上：

```js
import { ElMessage, ElMessageBox } from 'element-plus/es'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
```

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-visual-language`: 新增「命令式组件带自己的样式」

## Impact

**代码**

- `frontend/src/views/DraftView.vue`：去掉从 element-plus 根包的显式引入，交给自动导入
- `frontend/src/flows.spec.ts`：加一条回归测试——任何源文件都不许从 element-plus 根包引组件

**不受影响**

- 不改弹窗的文案与按钮
- 不改其它页面的弹窗（导入页本来是对的）
- 不新增依赖
