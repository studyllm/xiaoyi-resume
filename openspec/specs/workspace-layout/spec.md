# workspace-layout Specification

## Purpose
TBD - created by archiving change fix-workspace-layout. Update Purpose after archive.
## Requirements
### Requirement: 工作台的滚动只发生在内容区

系统 SHALL 把工作台的内容区作为唯一的滚动容器。当内容超出可视区域时，SHALL 由内容区自身滚动，SHALL NOT 滚动整个页面。侧栏 SHALL 能独立滚动，SHALL NOT 连带内容区或页面一起滚动。

#### Scenario: 内容超出时只滚动内容区

- **WHEN** 用户在内容区上滚动
- **THEN** 页面本身不发生滚动
- **AND** 内容区滚动到相应位置

#### Scenario: 侧栏内容超出时侧栏自己滚

- **WHEN** 侧栏的内容超出可视高度
- **THEN** 侧栏自身滚动
- **AND** 内容区与页面的滚动位置不受影响

#### Scenario: 落地页仍可整页滚动

- **WHEN** 用户在落地页上滚动
- **THEN** 页面正常滚动
- **AND** 落地页不属于工作台布局

### Requirement: 页头与下方内容共用同一个横向框架

系统 SHALL 让每一页的页头与它下方的内容处在同一个横向框架内，两者的左边缘对齐。承载纸面的页面，页头 SHALL 与纸同宽并与纸居中对齐；其它页面，页头 SHALL 与其内容容器同宽。落地页的顶栏 SHALL 与它的主内容共用同一个容器宽度。

#### Scenario: 纸面页的页头与纸对齐

- **WHEN** 用户打开承载纸面的页面
- **THEN** 页头的左边缘与纸的左边缘一致
- **AND** 页头的右边缘与纸的右边缘一致

#### Scenario: 其它页面的页头与内容对齐

- **WHEN** 用户打开承载列表或表单的页面
- **THEN** 页头的左边缘与其下方内容的左边缘一致

#### Scenario: 落地页顶栏与主内容对齐

- **WHEN** 用户打开落地页
- **THEN** 顶栏的左边缘与首屏内容的左边缘一致
- **AND** 顶栏的右边缘与首屏内容的右边缘一致

