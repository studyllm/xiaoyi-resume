## Why

P3 剩下的三件散事，收在一起做：

1. **备份与恢复**（T3.10）：数据库全部自管，备份是我们自己的责任。没演练过的备份不算备份。
2. **离线与保存失败要说清楚**（T3.6）：现在保存失败时页面会说「已保存」——说没存上的话比报错更坏。
3. **本机存量数据的迁移入口**（T3.8）：服务端有迁移端点了，前端没有入口。

## What Changes

- **备份与恢复脚本**：`server/scripts/backup.sh`（pg_dump → age 加密 → 传对象存储）与 `restore.sh`。
- **运维手册**：`docs/ops/runbook.md`——部署、回滚、数据修复、故障处置，**含简历内容泄露剧本**。
- **保存失败不再被说成「已保存」**：编辑页保存失败显示状态表里的文案；路由守卫里保存失败就留在本页，不带走改动。
- **离线横幅**：服务端不可达时顶栏下出现一条提示。
- **本机副本的迁移入口**：服务端没有、本机还有一份时，空态的位置换成迁移提示——搬或丢，由用户选，**不做静默迁移**；搬完本地那份清掉（PII 残留等于没迁）。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

- `resume-draft`: 保存失败时界面 SHALL 明确告知，不得显示成已保存。

## Impact

- 新增文件：`server/scripts/{backup,restore}.sh`、`docs/ops/runbook.md`。
- 改动文件：`frontend/src/stores/draft.ts`、`frontend/src/views/DraftView.vue`、`frontend/src/router/index.ts`、`frontend/src/layouts/DefaultLayout.vue`、`frontend/src/api/resume.ts`、`packages/shared/src/domain/states.ts`。
- 不改服务端的行为。
