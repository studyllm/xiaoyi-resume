## Why

上一轮把所有次要动作统一成了文字按钮，但 Element Plus 的文字按钮默认是「正文色 + 无边框」：

- 常态颜色 `--el-text-color-regular`（#3d434d），跟正文一字不差，扫一眼分不出这是按钮还是一段文字
- 悬停时**颜色完全不变**。`.el-button.is-text{color:var(--el-button-text-color)}` 的特异性高于 `.el-button:hover{color:var(--el-button-hover-text-color)}`，同特异性后者胜，所以悬停色根本不生效，只多一层几乎看不见的 `#f7f8f9` 淡灰

结果文字按钮既看不出可点，悬停也没反馈。

颜色还分成两派：`text type="primary"` 是松墨青，裸 `text` 是深灰。批注卡片一行三个按钮里两个灰一个青，版本卡片一行四个里三个灰一个青，同一排按钮颜色不统一。

## What Changes

- **文字按钮常态是主色**（松墨青），全项目统一。这一条同时解决"看不出是按钮"和"颜色不统一"。
- **文字按钮悬停时加一层淡青底**（`--brand-soft`），与纸面上「可编辑块悬停」用的是同一个底色。
- **破坏性确认与纸面删除入口不参与这套规则**：`text type="danger"` 保持红色，纸面删除入口保持淡灰常显、悬停转警示色——后者是既有规格已经写定的。
- **`el-link` 保留下划线**。链接是「跳到别处」，按钮是「在这里做事」，下划线是这两者的区分标志。

**不改动**：任何按钮的文案、行为、尺寸、层级；实心主色按钮；链接本身的颜色。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-visual-language`: 「操作按钮按语义分层」这条要求补上文字按钮的颜色与悬停反馈，以及与链接的区分。

## Impact

- `frontend/src/styles/main.css`: 新增两条覆盖 Element Plus 文字按钮的规则。
- `frontend/src/components/ResumeEditor.vue`: 无改动，但纸面删除入口的淡灰与悬停警示色靠新规则的排除项保住。
- 无新增依赖，无数据格式变更，无接口变更。
