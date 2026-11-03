---
name: project-xiaoyi-refactor-verification
description: 重构「小奕·简历」的编辑器组件时，用什么方法证明 DOM 与视觉没有变
metadata:
  type: project
---

`frontend/src/components/` 下的编辑器组件（ResumeEditor / CommentSidebar）与纸面结构绑定得很紧：焦点靠 DOM id 定位、样式是 scoped 的、外部定位靠 `anchor-item-*` / `anchor-bullet-*` / `paper-comment-*` 这些 id。**改这些组件时，「测试全绿」不足以证明没改坏东西**——scoped 样式搬错了位置静态测试抓不到。

**How to apply**：2026-11-03 拆组件时用了一套可复用的验证方法：

1. **DOM 快照比对**：把 `outerHTML` 落盘，剥掉 ` data-v-[a-f0-9]+=""`（Vue 的 scoped 属性渲染成带空值的，剥名字会留下 `=""` 假象），再把 Element Plus 的 `el-id-<全局计数>-` 归一化，与改动前逐字节 diff
2. **计算样式快照**：对每个元素导出 28 项计算样式，diff。scoped 样式搬错位置只有这里能看出来
3. **函数逐字比对**：事件/焦点/键盘处理函数用 `git show` 取旧版与新版做字符串对比，确认逻辑没被顺手改掉

**注意模板空白**：Vue 会把 `{{ x }}` 单独放一行渲染成前后带空格的文本节点。拆组件时若把模板压成一行，DOM 就不再字节一致——要么保持原格式，要么接受这处差异并说明。

相关：[[project-xiaoyi-roadmap-v1]]、[[project-xiaoyi-pr-workflow]]
