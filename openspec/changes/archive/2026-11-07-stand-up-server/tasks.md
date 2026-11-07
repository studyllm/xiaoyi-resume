## 1. 服务端骨架

- [x] 1.1 `server/package.json`：workspace、fastify、tsx、typescript、vitest、verify 脚本
- [x] 1.2 `server/tsconfig.json`：bundler 解析、`skipLibCheck`（vitest 的类型引用了浏览器全局）
- [x] 1.3 `server/src/app.ts` 组装应用、`server/src/index.ts` 启动
- [x] 1.4 根 `package.json` 的 workspaces 加 `server`，`verify` 跑两端

## 2. 端点

- [x] 2.1 `GET /api/v1/healthz`
- [x] 2.2 `POST /api/v1/draft/parse`——公开端点，跑共享包的 `parseDraft`；时间由服务端注入

## 3. 断言

- [x] 3.1 服务端用例：健康检查、解析成功、正文为空给 422
- [x] 3.2 **F9 的可执行断言**：HTTP 端点的输出与直接调用共享引擎逐字一致

## 4. 门禁与文档

- [x] 4.1 CI 增加服务端门禁（A3.5 三侧全绿）
- [x] 4.2 `CLAUDE.md`：目录结构补 server/、命令补服务端
- [x] 4.3 计划书：T3.4 标记完成、F9 标记已落地

## 5. 交接

- [x] 5.1 提醒：错误码表现在是路由里的字面量，契约 §5 的表随 T3.2 落地
- [x] 5.2 提醒：契约 21 个端点目前实现 2 个，其余随 T3.2 起逐个落地
