/**
 * 模型供应商的配置。
 *
 * **没配就是没有供应商**——生成路径回落规则引擎，不报错（ADR-0005 §3）。
 * 密钥只在这里出现一次，不进代码库、不进日志。
 */
export interface LlmConfig {
  /** OpenAI 兼容服务的地址，例如 `https://api.example.com/v1`。 */
  baseUrl: string
  apiKey: string
  model: string
  /** 单次调用的超时。模型慢不该拖死整个请求。 */
  timeoutMs: number
  /** 单次生成的输出 token 上限。成本护栏的第一道闸。 */
  maxTokens: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TOKENS = 2000

export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim()
  const apiKey = env.LLM_API_KEY?.trim()
  const model = env.LLM_MODEL?.trim()
  if (!baseUrl || !apiKey || !model) return null

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    timeoutMs: positiveNumber(env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxTokens: positiveNumber(env.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS),
  }
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
