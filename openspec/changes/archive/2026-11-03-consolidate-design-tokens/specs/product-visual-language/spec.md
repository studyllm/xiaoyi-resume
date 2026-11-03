## MODIFIED Requirements

### Requirement: 界面样式只使用设计变量

系统 SHALL 保证界面与纸面的颜色、字号、圆角、阴影与间距一律取自设计变量。组件与页面 SHALL NOT 写死这些视觉属性的字面量。

尺寸类属性 SHALL 与颜色一样受约束：`font-size`、`border-radius`、`padding`、`margin`、`gap` 及其长写形式 SHALL NOT 出现 px 字面量。

界面与纸面 SHALL 各用一套刻度：界面用 px 刻度，纸面用 pt 与 mm 表达物理尺寸——纸面要打印，物理单位才是对的，把 pt 折算成 px 再折算回去会引入误差。因此纸面的 pt 与 mm 字面量 SHALL 被允许。

#### Scenario: 扫描界面样式

- **WHEN** 界面样式被检查是否存在颜色等视觉属性的字面量
- **THEN** 除设计变量文件本身之外不出现这些字面量

#### Scenario: 尺寸走设计变量

- **WHEN** 全仓样式被检查是否存在字号、圆角与间距的 px 字面量
- **THEN** 除设计变量文件本身之外不出现这些 px 字面量
- **AND** 纸面的 pt 与 mm 不受这条约束

#### Scenario: 打印样式沿用同一套变量

- **WHEN** 简历被导出为 PDF
- **THEN** 纸面的颜色与字号与预览中一致

#### Scenario: 要点缩进保持对齐

- **WHEN** 纸面上要点下方的新增按钮与要点文字对齐
- **THEN** 按钮的左缩进等于列表缩进与条目缩进之和
