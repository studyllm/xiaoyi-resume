# product-identity Specification

## Purpose
TBD - created by archiving change add-product-logo. Update Purpose after archive.
## Requirements
### Requirement: 顶栏有品牌标识

系统 SHALL 在顶栏的产品名文字前显示品牌标识。品牌标识 SHALL 与产品名文字并列，SHALL NOT 取代产品名文字。落地页顶栏与工作台顶栏 SHALL 使用同一个标识资源。

品牌标识 SHALL 是装饰性的：与产品名文字并列时，标识 SHALL NOT 带替代文本，屏幕阅读器 SHALL 只朗读产品名文字一次。

#### Scenario: 落地页顶栏有标识

- **WHEN** 用户打开落地页
- **THEN** 顶栏的产品名文字前显示品牌标识
- **AND** 标识与产品名文字在同一行

#### Scenario: 工作台顶栏有标识

- **WHEN** 用户在工作台的任意页面
- **THEN** 顶栏的产品名文字前显示品牌标识
- **AND** 标识与落地页用的是同一个标识

#### Scenario: 标识与文字并存

- **WHEN** 用户看顶栏的品牌区域
- **THEN** 产品名文字仍然可见
- **AND** 标识不替代文字

#### Scenario: 标识不被重复朗读

- **WHEN** 屏幕阅读器读顶栏
- **THEN** 产品名只被读一遍
- **AND** 标识不产生额外的朗读内容

### Requirement: 品牌标识的资源位置固定

品牌标识 SHALL 放在 `frontend/src/assets/` 目录下，文件名 SHALL 为 `logo.png`。界面 SHALL 通过引用这一个文件来显示标识，SHALL NOT 在代码里另画一份图形。

#### Scenario: 标识来自固定路径

- **WHEN** 顶栏显示品牌标识
- **THEN** 标识由 `src/assets/logo.png` 这一个文件提供
- **AND** 界面代码只引用这一个资源，不在别处再画一份图形

#### Scenario: 换上真标识不改代码

- **WHEN** 正式标识定稿并覆盖同名文件
- **THEN** 顶栏显示新的标识
- **AND** 不需要改动任何组件代码

### Requirement: 顶栏只用标识的图形部分

顶栏 SHALL 只显示标识的图形部分，产品名 SHALL 由界面文字渲染。标识图片里已经含有的产品名字样 SHALL NOT 与顶栏文字重复出现。

标识 SHALL 背景透明，SHALL NOT 带白底色块，SHALL NOT 在白底与桌面底上出现可见的方块边界。

#### Scenario: 图形与文字不重复

- **WHEN** 用户看顶栏的品牌区
- **THEN** 标识图片里只有图形，没有产品名字样
- **AND** 产品名只由旁边的界面文字出现一次

#### Scenario: 标识没有白底方块

- **WHEN** 顶栏出现在不同底色上
- **THEN** 标识四周看不到白色方块边界
- **AND** 标识的图形完整可见

### Requirement: 图片资源不受设计变量约束

设计变量的约束 SHALL 覆盖样式文件。`frontend/src/assets/` 下的图片资源是独立文件，其颜色写在文件自身，SHALL NOT 通过样式变量注入。

#### Scenario: 资源文件里可以写死自己的颜色

- **WHEN** 查看标识资源文件
- **THEN** 它的颜色作为资源的一部分写在文件里
- **AND** 样式文件不出现为标识写死的颜色字面量

