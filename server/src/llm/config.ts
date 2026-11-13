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
  /**
   * 比对时最多发多少条要点给模型。
   *
   * **裁剪只影响模型能看到什么**，不影响系统能判定什么——模型判「未覆盖」
   * 的要求会用规则引擎在全部要点上复核一次。
   */
  maxCandidateBullets: number
}

/**
 * 单次调用的超时。
 *
 * **按「一整版简历」的量级定。** 实测（MiniMax-M3.1-Flash，77 条要点的简历）：
 * 一次改写要 10 分钟上下（每条约 7.6 秒）。按问答的量级（30 秒）配，模型还没
 * 写完就被掐断——整版回落规则引擎，用户等了几分钟拿到的还是规则写的。
 */
const DEFAULT_TIMEOUT_MS = 900_000
/**
 * 单次调用的输出 token 上限。
 *
 * **按「一整版简历」的量级定，不是按一次问答。** 实测（MiniMax-M3.1-Flash，
 * 77 条要点的简历）：一次改写要 3 万 token 上下，推理内容占了 78% 的额度。
 * 按问答的量级（2000）配，模型写一半被截断——整版回落规则引擎，用户等了几分钟
 * 拿到的还是规则写的。
 */
const DEFAULT_MAX_TOKENS = 32000
const DEFAULT_MAX_CANDIDATE_BULLETS = 40

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
    maxCandidateBullets: positiveNumber(
      env.LLM_MAX_CANDIDATE_BULLETS,
      DEFAULT_MAX_CANDIDATE_BULLETS,
    ),
  }
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}
