## ADDED Requirements

### Requirement: 命令式组件带自己的样式

系统 SHALL 保证以命令式方式调用的组件（消息提示、确认框）带上组件库自己的样式，SHALL NOT 只引入组件代码而漏掉样式。

#### Scenario: 确认框有样式

- **WHEN** 用户触发一个确认框
- **THEN** 确认框居中显示，带遮罩、标题与正文
- **AND** 按钮排在正文下方

#### Scenario: 消息提示有样式

- **WHEN** 系统弹出一条消息提示
- **THEN** 提示出现在页面顶部，带图标与正文
