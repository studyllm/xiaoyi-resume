import type {
  ChatCompletion,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '@xiaoyi/shared/engines/generator'

import type { LlmConfig } from './config'

/**
 * OpenAI 格式的 chat/completions 客户端。
 *
 * **协议用它的格式，不用它的服务**（ADR-0005 修订二）：只要供应商说 OpenAI 话，
 * 换一家就是改一个环境变量。
 */
export interface OpenAiChatOptions {
  /** 换掉 fetch 用。测试用假实现，不连真实供应商。 */
  fetchImpl?: typeof fetch
  /** 最多试几次。含第一次。 */
  maxAttempts?: number
  /** 重试之间等多久。测试设 0。 */
  retryDelayMs?: number
}

interface OpenAiResponse {
  choices?: { message?: { content?: unknown } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function createOpenAiChat(
  config: LlmConfig,
  options: OpenAiChatOptions = {},
): ChatCompletion {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2)
  const retryDelayMs = options.retryDelayMs ?? 300

  return async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await call(fetchImpl, config, request)
      } catch (error) {
        lastError = error
        // 客户端错误重试没有意义——同样的请求再发一次还是同样的结果
        if (!isWorthRetrying(error) || attempt === maxAttempts) break
        if (retryDelayMs > 0) await sleep(retryDelayMs * attempt)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('模型调用失败')
  }
}

async function call(
  fetchImpl: typeof fetch,
  config: LlmConfig,
  request: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  })

  if (!response.ok) {
    const error = new Error(`模型返回 ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  const payload = (await response.json()) as OpenAiResponse
  const text = payload.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('模型返回的内容为空')
  }

  return {
    text,
    promptTokens: payload.usage?.prompt_tokens,
    completionTokens: payload.usage?.completion_tokens,
  }
}

/** 网络错误与 5xx 才值得再试一次。 */
function isWorthRetrying(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const status = (error as Error & { status?: number }).status
  if (status === undefined) return true
  return status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
