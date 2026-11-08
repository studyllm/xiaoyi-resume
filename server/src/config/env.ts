import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 读取本地的环境变量文件。
 *
 * 服务端的配置全部来自环境变量：部署时由进程管理器注入，本地开发时放在
 * 服务端目录下的 `.env` 里。`.env.example` 写着「复制成 .env 后按需改」——
 * 那这句话得是真的，否则 `npm run dev:server` 起不来，页面上只能看到
 * 开发代理转出来的一个 500。
 *
 * **进程环境里已有的同名变量优先**：部署时注入的配置不能被本机文件盖掉，
 * 文件只补空缺。
 *
 * @param dir 环境变量文件所在的目录
 * @returns 文件存在并已读取时为 true，没有这个文件时为 false
 */
export function loadLocalEnv(dir: string): boolean {
  const file = resolve(dir, '.env')
  if (!existsSync(file)) return false
  process.loadEnvFile(file)
  return true
}
