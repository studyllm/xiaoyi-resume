## MODIFIED Requirements

### Requirement: 导出的 PDF 具备文字层

系统 SHALL 通过浏览器的打印能力导出 PDF。导出物 SHALL 含有可被选取与检索的文字层，SHALL NOT 是整页位图。

导出时 SHALL 隐藏界面自身的元素，包括顶栏、侧边菜单、演示模式标识与操作按钮，SHALL NOT 把任何界面装饰印进 PDF。

#### Scenario: 导出得到带文字层的 PDF

- **WHEN** 用户导出一个版本
- **THEN** 得到的 PDF 中简历文字可被选取与检索
- **AND** PDF 中不包含界面自身的元素

#### Scenario: 导出包含简历抬头

- **WHEN** 该版本带有姓名与联系方式
- **THEN** 导出的 PDF 顶部呈现姓名与联系方式

#### Scenario: 导出提示如何保存

- **WHEN** 用户点击导出 PDF
- **THEN** 系统调起浏览器打印对话框
- **AND** 界面提示用户在打印目标中选择「另存为 PDF」
