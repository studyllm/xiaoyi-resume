# 小奕·简历

> 一份简历，按 JD 生成多个互不影响的版本。

求职者通常用多份 PDF 应对不同岗位，内容来自同一段经历，差别只是侧重点。这个工具把这件事收成：**维护一份「我的简历」，粘贴不同的职位描述，得到多个各自独立的版本。**

## 现状：还在开发

前端与服务端在**同一个仓库**里：

- 简历解析与版本生成由**服务端的规则引擎**完成——引擎的源码放在共享包里，前端与服务端引用的是**同一份文件**，不是两份拷贝。
- 诊断暂时在浏览器里跑：服务端的诊断端点还没落地（契约里已经写好），等它落地再切过去。
- 数据存在服务端的 Postgres 里，账号是**邮箱 + 密码**。换一台设备登录，看到的还是同一份简历。
- 上传的 PDF **在浏览器里解析**，文件本身不会上传到服务器；发到服务端的只有提取出来的文字。

界面上仍带「演示模式」标识：**大模型还没接上**，生成的质量与覆盖面都还是规则引擎的水平。它用来验证交互与规则，还不是可以直接大规模使用的成品。

## 能做什么

| 能力 | 说明 |
| --- | --- |
| 放入简历 | 粘贴纯文本，解析成可编辑的结构化简历 |
| 直接改 | 在纸面上改正文、增删要点与条目，改完即所见即所得 |
| 诊断 | 只看这份简历本身的问题，意见落到具体句子，可与纸面双向定位 |
| 按 JD 生成 | 粘贴职位描述，得到一版针对该岗位的简历，并标出相对原文改了哪些 |
| 多版本 | 每个 JD 一个版本快照，互不影响；简历后续修改不回写旧版本 |
| 导出 | A4 预览、纯文本、Markdown、PDF（带文字层，招聘系统能提取到字段） |

## 不做什么

- **不编造。** 生成版本只重组、删减、强调简历里已有的事实。材料不足以支撑的岗位要求会如实标为「未覆盖」，而不是补一个像样的说法。
- **不还原原始 PDF 的版式。** 能拿到的只有文本，栏位、图标与分页既拿不到也拿不回。
- **不做多份简历库。** 一个用户一份「我的简历」，岗位差异用版本表达。
- **不接 Word、图片与在线表格。** 扫描件 PDF 没有文字层，本版不支持——上传后会明确告诉你，并把你已经能读到的部分交给你改。
- 本仓库只做简历工具，其它方向不在此范围内。

## 快速开始

需要 **Node.js 22**、npm 与 Docker（本地跑 Postgres 用）。

```bash
npm install          # 仓库根——npm workspace，一次装好前端、服务端与共享包
cp server/.env.example server/.env   # 服务端的配置放这个文件里，按需修改
npm run db:up        # 起 Postgres
npm run db:mail      # 起 Mailpit——验证邮件在 http://localhost:8025 里看
npm run db:migrate   # 跑迁移，建表
npm run dev          # 前端 http://localhost:5173
npm run dev:server   # 服务端 http://localhost:3000（另开一个终端）
```

打开 http://localhost:5173 。落地页上点「用示例简历试一遍」，不需要自备简历就能走通全流程——它会在服务端建一个临时的演示账号。

**`.env` 那一步不能省。** 服务端的配置全部来自环境变量，没复制这个文件，服务端会以「缺少环境变量 DATABASE_URL」退出；后端起不来时，页面上只会看到一个开发代理转出来的 500。

**`db:mail` 那一步也不能省。** Mailpit 是收信用的本地邮件服务，它不在 `db:up` 里（默认不起）。没起它，注册接口会以 502「验证邮件没发出去」失败——SMTP 连不上 127.0.0.1:1025。

前端在 5173、服务端在 3000，**开发时前端走 Vite 代理访问 `/api`**——同源，不用管 CORS，session cookie 也不用管 SameSite 与凭证。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 前端开发服务器 |
| `npm run dev:server` | 服务端开发服务器 |
| `npm run test` | 跑全部测试 |
| `npm run type-check` | 类型检查 |
| `npm run build` | 类型检查 + 构建 |
| `npm run verify` | **门禁**：类型检查 → 全量并行测试 → 打乱顺序测试 → 构建（前端 + 服务端） |
| `npm run db:up` / `db:down` | 起 / 停 Postgres |
| `npm run db:mail` | 起 Mailpit（收验证邮件，界面在 http://localhost:8025） |
| `npm run db:migrate` | 跑数据库迁移 |

## 开发

### 门禁

`npm run verify` 是「这次改动能不能交付」的唯一判定入口，本地与持续集成调用同一个命令，**前端与服务端一起跑**。

后两项跑的是**同一批用例**，只是文件执行顺序被打乱（种子固定）。两者都通过才算通过——目的是把偶发失败变成可复现失败，而不是靠运气。

细节见 [docs/ci/README.md](docs/ci/README.md)。

### 规格驱动

产品行为由 OpenSpec 规格定义，代码只是它的实现：

- `openspec/specs/` —— 当前生效的行为基准，19 个能力域
- `openspec/changes/` —— 进行中的变更；一轮变更全部实现完再统一归档

改功能之前先读对应 spec。规范与代码冲突时以 spec 为准，并说明差异。

### 目录

```
frontend/src/         前端应用
  stores/             Pinia：身份、简历、版本、界面态
  components/         通用与业务组件
  views/              页面级组件
  pdf/                浏览器专属：PDF 文字层提取
  styles/             设计变量与全局样式
  mock/               演示数据
server/               服务端
  src/routes/         路由与契约 schema
  src/db/             Drizzle 表定义、迁移、存取
  src/auth/           会话、密码、邮件
  src/http/           日志、请求 id、错误处理
  scripts/            备份、恢复、每日巡检
packages/shared/      前后端共享的同一份源码
  src/domain/         纯数据类型与工具
  src/engines/        规则引擎：解析、诊断、JD 解析、版本生成
  src/contracts/      契约：错误码表与请求响应 schema
openspec/             规格与变更记录
docs/                需求文档、开发计划、决策记录、运维手册
```

**共享包不是复制。** `packages/shared` 里的文件被前端与服务端引用同一份，改动两端同时生效——「同一输入同一输出」靠结构保证，不靠约定。

## 文档

- [产品需求文档 v0.1](docs/v0.1-产品需求文档.md)
- [产品开发计划 v0.1 → v1.0](docs/产品开发计划-v1.0.md)
- [API 契约](docs/api-contract.md)
- [门禁与 CI 说明](docs/ci/README.md)
- [运维手册](docs/ops/runbook.md)
- 决策记录：[ADR-0001 引擎模式开关](docs/adr/0001-engine-mode-switch.md)、[ADR-0002 鉴权模型](docs/adr/0002-auth-model.md)、[ADR-0003 事实账本与校验器](docs/adr/0003-integrity-verifier.md)、[ADR-0004 引擎位置](docs/adr/0004-engine-placement.md)、[ADR-0005 模型接入形态](docs/adr/0005-llm-access-shape.md)
- 开发规范见 [CLAUDE.md](CLAUDE.md)

## License

[MIT](LICENSE)
