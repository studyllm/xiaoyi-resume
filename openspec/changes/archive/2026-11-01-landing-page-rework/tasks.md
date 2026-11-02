## 1. 设计变量

- [x] 1.1 `frontend/src/styles/tokens.css`：新增 `--landing-width: 1280px`、`--landing-showcase-width: 700px`、`--paper-fragment-width: 420px`、`--text-2xl: 28px`
- [x] 1.2 `frontend/src/styles/main.css`：落地页样例区复用已有的 `.paper-canvas`（桌面底 + 圆角 + 溢出裁剪），不新增重复的类；纸在画布里的留白由落地页自己的 scoped 样式给

## 2. 样例区：裁剪数据与片段形态

- [x] 2.1 `frontend/src/mock/showcase.ts`：导出裁剪后的样例片段 `SHOWCASE_FRAGMENT_SECTIONS`——只有「工作经历」分区与其中一条经历及其要点，三条批注的锚点句子都落在片段内
- [x] 2.2 `frontend/src/components/ResumePreview.vue`：新增 `variant?: 'page' | 'fragment'`，`fragment` 时纸宽用 `--paper-fragment-width`、取消 A4 最小高度、收紧内边距、在画布里居中；默认 `page` 形态不变
- [x] 2.3 确认编辑页、诊断页、导入页三处使用点不传 `variant`，渲染结果与改动前一致（浏览器实测纸面版式未变）

## 3. 登录入口收敛为对话框

> 本组的 `LoginDialog` 在第 7 组被 `IdentityDialog` 取代：密码字段与「随便写一个」的提示随之移除。

- [x] 3.1 `frontend/src/components/LoginDialog.vue`（新增）：`el-dialog` 居中、默认尺寸、遮罩、标题与正文；内含用户名与密码表单、实心主色提交按钮、原型性质说明
- [x] 3.2 登录对话框的表单校验：空用户名或空密码给出错误提示且不提交；提交成功建立登录态并通知调用方
- [x] 3.3 `frontend/src/components/LoginCard.vue`：删除（唯一引用方是落地页，职责迁入登录对话框）
- [x] 3.4 `frontend/src/router/index.ts`：删除 `/login` 路由；未登录访问受限页面时重定向到 `/` 并带 `redirect` 参数
- [x] 3.5 落地页读到 `redirect` 参数时自动打开登录对话框，登录成功后跳转到该参数指向的页面；打开后把地址里的参数去掉，避免再次进入时重复弹窗

## 4. 落地页重写

- [x] 4.1 `frontend/src/views/WelcomeView.vue`：顶栏与主内容改用同一个 `landing-container` 类，左右边缘对齐
- [x] 4.2 首屏改双列 `minmax(0, 1fr) 700px`；大标题跨满整行（挤在文案栏里会把最后一个字孤立成一行），文案栏约 516px
- [x] 4.3 样例区替换为「局部放大片段」：纸片段落在桌面上，批注栏在右侧按严重度着色，每张批注带出被批注的句子摘录，与纸面高亮同色
- [x] 4.4 批注栏与纸的锚点顺序一致，批注栏顶部与纸顶部对齐
- [x] 4.5 移除首屏的登录卡，改为 CTA 在未登录时打开登录对话框；落地页模板内只剩一个实心主色按钮（第 8 组进一步改成 CTA 不再弹框）
- [x] 4.6 演示模式标识收敛到顶栏 tag 与页脚两处；登录对话框里用正文说明原型性质，不再加第三块标识
- [x] 4.7 落地页样式全部改走设计变量：字号用 `--text-*`，间距用 `--space-*`，颜色用语义变量
- [x] 4.8 窄屏（≤1100px）时样例区转纵向，纸片段宽度不超出容器并在画布里居中，页面不横向溢出

## 5. 守卫与测试

- [x] 5.1 `frontend/src/flows.spec.ts`：把 `LoginDialog.vue` 登记为独立交互层，断言落地页层实心主色恰好一个、覆盖层不超过一个；同步删除已废的 `LoginCard.vue` 例外
- [x] 5.2 `frontend/src/flows.spec.ts`：新增落地页样式字面量扫描——只扫 `WelcomeView.vue` 的 style 块，`font-size`/`border-radius`/`padding`/`margin`/`gap` 的 px 字面量为 0；在注释里写明「存量其它组件本轮不动」的理由
- [x] 5.3 `frontend/src/views/WelcomeView.spec.ts`（新增）：渲染出三条样例批注，每张带对应其严重度的 class；顶栏与主内容使用同一个容器 class
- [x] 5.4 `frontend/src/views/WelcomeView.spec.ts`：未登录点 CTA 打开登录对话框，登录成功后进入导入页；带 `redirect` 进来时对话框自动打开
- [x] 5.5 `frontend/src/components/LoginDialog.spec.ts`（新增，第 7 组改名 `IdentityDialog.spec.ts`）：空凭据给出错误且不提交；提交成功建立登录态并通知调用方；对话框说明原型性质
- [x] 5.6 `frontend/src/flows.spec.ts` 的禁用词与「底稿」扫描覆盖新组件与新文案

## 6. 验收

- [x] 6.1 `cd frontend && npm run type-check` 通过
- [x] 6.2 `cd frontend && npm run test` 通过（31 个文件 / 447 个用例）
- [x] 6.3 浏览器实测：1280 / 1440 / 1920 三档视口，落地页左右边缘对齐、主标题不断在词中间、样例正文可读、批注不喧宾夺主
- [x] 6.4 浏览器实测：未登录点「放入第一份简历」弹出登录对话框，登录成功进入导入页；直接访问 `/import` 也会被带到落地页并自动开框
- [x] 6.5 浏览器实测：编辑页、诊断页的纸面版式与改动前一致
- [x] 6.6 窄屏（≤1100px）下落地页不横向溢出，样例区转为纵向

## 7. 身份只要名字，不要密码

- [x] 7.1 `frontend/src/stores/session.ts`：`login` 去掉密码参数，登录态结构不变
- [x] 7.2 `frontend/src/components/IdentityDialog.vue`（新增，替代 `LoginDialog.vue`）：单字段「你的名字」，无密码输入项；按场景区分文案——保存场景标题「这份简历归你」、正文「给这份简历留个名字，之后你打开时就知道它在这儿。名字和简历都只存在这台设备上。」、按钮「保存到我的简历」；继续场景标题「留个名字就能继续」、正文「名字和简历都只存在这台设备上，不需要注册账号。」、按钮「继续」
- [x] 7.3 `frontend/src/components/IdentityDialog.spec.ts`（新增，替代 `LoginDialog.spec.ts`）：名字为空时给出错误且不提交；提交成功建立登录态并通知调用方；对话框里没有密码输入项；两种场景的文案各自正确
- [x] 7.4 `frontend/src/mock/loadDemo.ts`：适配去掉密码的 `login`
- [x] 7.5 `frontend/src/layouts/DefaultLayout.vue`：未登录时不渲染头像与「退出登录」下拉

## 8. 身份推迟到保存时

- [x] 8.1 `frontend/src/router/index.ts`：路由 meta 新增 `requiresLogin`（默认 true），导入页设为 false；`public` 保持原义不改
- [x] 8.2 `frontend/src/views/ImportView.vue`：允许匿名使用；`save()` 在未登录时先弹身份对话框，确认后这次保存继续完成，放弃则不保存
- [x] 8.3 `frontend/src/views/WelcomeView.vue`：主按钮不再弹对话框，直接进导入页；未登录时「打开我的简历」交给守卫处理
- [x] 8.4 `frontend/src/views/WelcomeView.vue`：按钮文案改为无草稿「导入我的简历」、有草稿「打开我的简历」、旁路「用示例简历试一遍」
- [x] 8.5 `frontend/src/flows.spec.ts`：`OVERLAY_LAYERS` 里的 `LoginDialog.vue` 改为 `IdentityDialog.vue`；新增「身份对话框里没有密码输入项」与「旁路动作不用『数据』指代简历」的检查
- [x] 8.6 `frontend/src/views/WelcomeView.spec.ts`、`src/views/ImportView.spec.ts`、`src/router/index.spec.ts`：点主按钮直接进入导入页且不弹身份对话框；带 `redirect` 进来时身份对话框自动打开，确认后回到目标页；未登录能进导入页、被带离受限页面

## 9. 验收（文案与身份）

- [x] 9.1 `cd frontend && npm run type-check` 通过
- [x] 9.2 `cd frontend && npm run test` 通过（31 个文件 / 456 个用例）
- [x] 9.3 浏览器实测：落地页两个按钮的名字与预期一致，未登录点主按钮直接进导入页，页面上不出现任何身份表单
- [x] 9.4 浏览器实测：导入页粘贴并解析全程不要求身份；点「保存」时弹身份框，只有名字一个字段；确认后保存成功并进入我的简历
- [x] 9.5 浏览器实测：未登录直接访问 `/draft` 被带到落地页并自动弹身份框，确认后打开我的简历
- [x] 9.6 浏览器实测：未登录时工作台顶栏不显示空的用户区

## 7. 首屏重排

- [x] 7.1 大标题从跨满整行移进文案栏；文案栏定宽 560px，标题一行放得下（实测 528px）
- [x] 7.2 三个特性从首屏下方的横排卡片区搬进文案栏，成为带上边框分隔的清单；首屏下方不再有内容
- [x] 7.3 样例区内部改成纸画布 400px + 批注栏 240px；纸片段加上「教育背景」分区，纸高 389px
- [x] 7.4 批注的建议压成一行（`mock/showcase.ts` 的文案），批注栏与纸齐平
- [x] 7.5 窄屏（≤1100px）转纵向时，纸画布不超出容器并居中
- [x] 7.6 `frontend/src/flows.spec.ts`：落地页容器数量从 4 改成 3（特性区不再是独立区块）
