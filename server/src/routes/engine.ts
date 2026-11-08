import type { FastifyInstance } from 'fastify'

/**
 * 引擎状态。
 *
 * 前端要知道自己能不能选「本次用模型」——服务端没配供应商时那个开关是死的，
 * 不显示比显示一个按了没反应的开关好。
 *
 * **只回一个布尔值**：模型 id 与供应商地址是部署细节，不给前端。
 */
export function registerEngineRoutes(
  app: FastifyInstance,
  deps: { llm: { model: string } | null },
): void {
  app.get('/api/v1/engine', async () => ({
    available: deps.llm !== null,
  }))
}
