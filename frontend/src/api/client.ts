import { ERROR_CODES, type ErrorCode } from '@xiaoyi/shared/contracts/error-codes'
import { ALL_STATES, type StateCopy } from '@xiaoyi/shared/domain/states'

/** 后端返回的错误。`state` 是要展示给用户的那一条。 */
export class ApiError extends Error {
  readonly code: ErrorCode | 'UNKNOWN'
  readonly state: StateCopy
  readonly field?: string
  readonly requestId?: string
  /** 连不上服务端（与服务端返回的错误不是一回事）。 */
  readonly offline: boolean

  constructor(
    code: ErrorCode | 'UNKNOWN',
    state: StateCopy,
    field?: string,
    requestId?: string,
    offline = false,
  ) {
    super(state.title)
    this.name = 'ApiError'
    this.code = code
    this.state = state
    this.field = field
    this.requestId = requestId
    this.offline = offline
  }
}

/**
 * 按错误码取出该展示给用户的那条状态。
 *
 * **文案只有一处来源**：`ALL_STATES`。服务端返回的 `message` 只在前端没登记
 * 那个码时用（那时也是我们自己的兜底文案，不是后端那句）。
 */
export function stateForCode(code: string): { state: StateCopy; known: boolean } {
  if (code in ERROR_CODES) {
    const spec = ERROR_CODES[code as ErrorCode]
    const state = ALL_STATES[spec.state]
    if (state) return { state, known: true }
  }
  return { state: ALL_STATES['internal-error']!, known: false }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** 幂等键。契约 §6：需要它的 POST 必须带。 */
  idempotencyKey?: string
  /** 额外请求头。乐观并发要用 If-Match 带修订号。 */
  headers?: Record<string, string>
  signal?: AbortSignal
}

/**
 * 调服务端。
 *
 * 失败时抛 `ApiError`，带上一条该展示的状态——调用方直接用它拼提示，
 * 不用自己再判一遍错误码。
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  for (const [name, value] of Object.entries(options.headers ?? {})) headers[name] = value

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    // 连不上服务端：给「离线」那一条，不是「出了点问题」
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('UNKNOWN', ALL_STATES['offline']!, undefined, undefined, true)
  }

  const requestId = response.headers.get('x-request-id') ?? undefined

  if (response.ok) {
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  let code = 'UNKNOWN'
  let field: string | undefined
  try {
    const body = (await response.json()) as { error?: { code?: string; field?: string } }
    code = body?.error?.code ?? 'UNKNOWN'
    field = body?.error?.field
  } catch {
    // 响应体不是 JSON——按未知错误处理
  }

  const { state } = stateForCode(code)
  throw new ApiError(code as ErrorCode | 'UNKNOWN', state, field, requestId)
}
