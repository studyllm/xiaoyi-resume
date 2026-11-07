/**
 * 契约的错误码表（`docs/api-contract.md` §5）。
 *
 * **两侧的唯一来源**：服务端按它生成响应，前端按它从状态表取文案。
 * 不在两处各写一份——那正是这份表要消灭的问题。
 *
 * `state` 指向 `domain/states.ts` 里的条目。守卫断言两者一一对应：
 * 改了码而忘了加状态（或反过来），测试立刻红。
 */
export interface ErrorCodeSpec {
  /** HTTP 状态码。 */
  http: number
  /** 前端状态表里的键。 */
  state: string
}

export const ERROR_CODES = {
  AUTH_REQUIRED: { http: 401, state: 'not-logged-in' },
  INVALID_CREDENTIALS: { http: 401, state: 'invalid-credentials' },
  EMAIL_NOT_VERIFIED: { http: 403, state: 'email-not-verified' },
  EMAIL_TAKEN: { http: 409, state: 'email-taken' },
  INVALID_RESET_TOKEN: { http: 400, state: 'invalid-reset-token' },
  RESUME_NOT_FOUND: { http: 404, state: 'no-draft' },
  VERSION_NOT_FOUND: { http: 404, state: 'version-not-found' },
  DRAFT_REVISION_CONFLICT: { http: 409, state: 'draft-conflict' },
  PARSE_FAILED: { http: 422, state: 'parse-failed' },
  RESUME_EMPTY: { http: 422, state: 'parse-empty' },
  JD_EMPTY: { http: 422, state: 'jd-empty' },
  JD_PARSE_FAILED: { http: 422, state: 'jd-parse-failed' },
  GENERATION_FAILED: { http: 422, state: 'generate-failed' },
  LLM_UNAVAILABLE: { http: 503, state: 'llm-unavailable' },
  LLM_TIMEOUT: { http: 504, state: 'llm-timeout' },
  RATE_LIMITED: { http: 429, state: 'rate-limited' },
  STORAGE_UNAVAILABLE: { http: 503, state: 'storage-unavailable' },
  VALIDATION_FAILED: { http: 400, state: 'validation-failed' },
  INTERNAL_ERROR: { http: 500, state: 'internal-error' },
} as const satisfies Record<string, ErrorCodeSpec>

export type ErrorCode = keyof typeof ERROR_CODES

/** 码 → 规格。 */
export function errorSpec(code: ErrorCode): ErrorCodeSpec {
  return ERROR_CODES[code]
}
