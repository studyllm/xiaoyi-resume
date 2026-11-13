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
  choices?: { message?: { content?: unknown }; finish_reason?: string }[]
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
  let response: Response
  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
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
  } catch (error) {
    throw translateFetchError(error, config)
  }

  if (!response.ok) {
    // **把服务商说的带上。** 只留状态码是不够的：402 与 401 都是「没调通」，
    // 但一个是余额不足、一个是密钥不对——只有服务商自己说得清。
    // 截断：正文可能很长，日志与生成日志里都不需要全文。
    const detail = await errorDetail(response)
    const error = new Error(
      `模型返回 ${response.status}${detail ? `：${detail}` : ''}`,
    ) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  const payload = (await response.json()) as OpenAiResponse
  const choice = payload.choices?.[0]
  const text = choice?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    // 内容空有两种情况：模型压根没写，和写了但被上限截断。
    // 后者要调大的是输出上限，不是重试能解决的。
    throw new Error(
      choice?.finish_reason === 'length'
        ? `模型输出被截断（上限 ${request.maxTokens} token）。请调大 LLM_MAX_TOKENS。`
        : '模型返回的内容为空',
    )
  }

  return {
    text,
    promptTokens: payload.usage?.prompt_tokens,
    completionTokens: payload.usage?.completion_tokens,
  }
}

/**
 * 服务商的错误说明。
 *
 * 优先取正文里的 `error.message`（OpenAI 兼容的形状：`{"error":{"message":"…"}}`），
 * 拿不到就退回正文本身。截到 300 字——正文可能很长，日志里不需要全文。
 */
async function errorDetail(response: Response): Promise<string> {
  let body: string
  try {
    body = await response.text()
  } catch {
    return ''
  }
  if (!body.trim()) return ''
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown }
    const message = parsed.error?.message ?? parsed.message
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 300)
  } catch {
    // 不是 JSON——退回正文
  }
  return body.trim().slice(0, 300)
}

/**
 * 把 fetch 抛的错翻译成能行动的话。
 *
 * 超时是最常见的一种，而 Node 给的「The operation was aborted due to timeout」
 * 没人知道该改什么——实际上要调的是超时上限。
 *
 * **保留原来的 name**：重试判定靠它（超时不重试 ✓）。
 */
function translateFetchError(error: unknown, config: LlmConfig): Error {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    const translated = new Error(
      `模型响应超时（上限 ${Math.round(config.timeoutMs / 1000)} 秒）。生成一整版简历要更久，请调大 LLM_TIMEOUT_MS。`,
    )
    translated.name = error.name
    translated.cause = error
    return translated
  }
  return error instanceof Error ? error : new Error('模型调用失败')
}

/**
 * 网络错误与 5xx 才值得再试一次。
 *
 * **超时不重试**：同样的输入再发一次，还是那么慢——白等一遍还把用户的等待
 * 时间翻倍。生成一整版简历本来就慢。
 */
function isWorthRetrying(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return false
  const status = (error as Error & { status?: number }).status
  if (status === undefined) return true
  return status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
