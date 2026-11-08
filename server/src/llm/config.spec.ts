import { describe, expect, it } from 'vitest'

import { llmConfigFromEnv } from './config'

describe('模型供应商的配置', () => {
  it('三个必填项缺一个就当没有供应商', () => {
    expect(llmConfigFromEnv({})).toBeNull()
    expect(llmConfigFromEnv({ LLM_BASE_URL: 'https://x/v1' })).toBeNull()
    expect(
      llmConfigFromEnv({ LLM_BASE_URL: 'https://x/v1', LLM_API_KEY: 'sk' }),
    ).toBeNull()
  })

  it('配齐了就读出来，并把末尾的斜杠去掉', () => {
    const config = llmConfigFromEnv({
      LLM_BASE_URL: 'https://model.example.com/v1/',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'test-model',
    })
    expect(config?.baseUrl).toBe('https://model.example.com/v1')
    expect(config?.model).toBe('test-model')
  })

  it('超时与 token 上限有默认值，填了负数就用默认值', () => {
    const config = llmConfigFromEnv({
      LLM_BASE_URL: 'https://x/v1',
      LLM_API_KEY: 'sk',
      LLM_MODEL: 'm',
      LLM_TIMEOUT_MS: '-5',
      LLM_MAX_TOKENS: '800',
    })
    expect(config?.timeoutMs).toBe(30_000)
    expect(config?.maxTokens).toBe(800)
  })
})
