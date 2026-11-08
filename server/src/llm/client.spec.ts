import { describe, expect, it } from 'vitest'

import { createOpenAiChat } from './client'
import type { LlmConfig } from './config'

const CONFIG: LlmConfig = {
  baseUrl: 'https://model.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  timeoutMs: 1000,
  maxTokens: 500,
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const REQUEST = {
  model: 'test-model',
  messages: [{ role: 'user' as const, content: '你好' }],
  temperature: 0,
  maxTokens: 500,
}

describe('OpenAI 兼容客户端', () => {
  it('按 OpenAI 格式发请求，取回正文与 token 数', async () => {
    let seenUrl = ''
    let seenBody = ''
    let seenAuth = ''
    const chat = createOpenAiChat(CONFIG, {
      fetchImpl: async (url, init) => {
        seenUrl = String(url)
        seenBody = String(init?.body ?? '')
        seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? '')
        return jsonResponse({
          choices: [{ message: { content: '改写后的正文' } }],
          usage: { prompt_tokens: 120, completion_tokens: 60 },
        })
      },
    })

    const result = await chat(REQUEST)
    expect(result.text).toBe('改写后的正文')
    expect(result.promptTokens).toBe(120)
    expect(result.completionTokens).toBe(60)
    expect(seenUrl).toBe('https://model.example.com/v1/chat/completions')
    expect(seenAuth).toBe('Bearer sk-test')
    expect(JSON.parse(seenBody)).toMatchObject({
      model: 'test-model',
      temperature: 0,
      max_tokens: 500,
    })
  })

  it('模型返回 5xx 时重试一次', async () => {
    let attempts = 0
    const chat = createOpenAiChat(
      CONFIG,
      {
        retryDelayMs: 0,
        fetchImpl: async () => {
          attempts += 1
          if (attempts === 1) return jsonResponse({}, 503)
          return jsonResponse({ choices: [{ message: { content: '好了' } }] })
        },
      },
    )

    const result = await chat(REQUEST)
    expect(attempts).toBe(2)
    expect(result.text).toBe('好了')
  })

  it('模型返回 4xx 时不重试——重试没有意义', async () => {
    let attempts = 0
    const chat = createOpenAiChat(
      CONFIG,
      {
        retryDelayMs: 0,
        fetchImpl: async () => {
          attempts += 1
          return jsonResponse({}, 401)
        },
      },
    )

    await expect(chat(REQUEST)).rejects.toThrow('模型返回 401')
    expect(attempts).toBe(1)
  })

  it('模型返回空内容时报错', async () => {
    const chat = createOpenAiChat(CONFIG, {
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: '' } }] }),
    })

    await expect(chat(REQUEST)).rejects.toThrow('模型返回的内容为空')
  })
})
