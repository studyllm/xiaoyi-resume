import { describe, expect, it } from 'vitest'

import { ALL_STATES } from '@xiaoyi/shared/domain/states'
import { ApiError, stateForCode } from './client'

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
