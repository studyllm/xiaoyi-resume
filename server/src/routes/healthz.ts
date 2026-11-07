import type { FastifyInstance } from 'fastify'

/** 健康检查。部署与监控用（计划 T3.10）。 */
export function registerHealthz(app: FastifyInstance): void {
  app.get('/api/v1/healthz', async () => ({ ok: true }))
}
