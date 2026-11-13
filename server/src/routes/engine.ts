import type { FastifyInstance } from 'fastify'

/**
 * 引擎状态。
 *
 * 前端要知道自己能不能选「本次用模型」——服务端没配供应商时那个开关是死的，
 * 不显示比显示一个按了没反应的开关好。
 *
 * **只回一个布尔值**：模型 id 与供应商地址是部署细节，不给前端。
 *
 * **超时上限要下发**：模型调用要跑好几分钟，客户端得知道该等多久。
 * 两边各写一个数 inevitably 会脱节——契约里承诺的 30 秒会把每一次真实的
 * 模型调用都掐掉。
 */
export function registerEngineRoutes(
  app: FastifyInstance,
  deps: { llm: { model: string; timeoutMs?: number } | null },
): void {
  app.get('/api/v1/engine', async () => ({
    available: deps.llm !== null,
    // 没配供应商时没有模型调用要等
    timeoutMs: deps.llm?.timeoutMs ?? null,
  }))
}
