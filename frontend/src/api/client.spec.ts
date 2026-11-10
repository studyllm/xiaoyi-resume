import { afterEach, describe, expect, it, vi } from 'vitest'

import { ALL_STATES } from '@xiaoyi/shared/domain/states'
import { ApiError, api, stateForCode } from './client'

describe('错误码映射', () => {
  it('按码取出该展示的状态', () => {
    const { state, known } = stateForCode('INVALID_CREDENTIALS')
    expect(known).toBe(true)
    expect(state).toBe(ALL_STATES['invalid-credentials'])
  })

  it('没登记的码回落到「出了点问题」，不直接展示后端那句', () => {
    const { state, known } = stateForCode('SOMETHING_NEW')
    expect(known).toBe(false)
    expect(state).toBe(ALL_STATES['internal-error'])
  })

  it('错误带上状态、字段与请求编号', () => {
    const error = new ApiError(
      'VALIDATION_FAILED',
      ALL_STATES['validation-failed']!,
      'email',
      'req-123',
    )
    expect(error.code).toBe('VALIDATION_FAILED')
    expect(error.state.title).toBe('填的内容有问题')
    expect(error.field).toBe('email')
    expect(error.requestId).toBe('req-123')
  })
})

describe('响应体不是 JSON 时', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('5xx 当成连不上——请求没到我们的服务端', async () => {
    // 开发代理在后端挂掉时回的就是这么一段：状态码 500，正文不是 JSON
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Error occurred while trying to proxy', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    const error = await api('/api/v1/draft/parse').catch((caught) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).offline).toBe(true)
    expect((error as ApiError).state).toBe(ALL_STATES['offline'])
  })

  it('4xx 不是连不上——那是我们的服务端回的话', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    )

    const error = await api('/api/v1/draft/parse').catch((caught) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).offline).toBe(false)
  })
})
