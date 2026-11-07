import { describe, expect, it } from 'vitest'

import { createIdSeed } from '@xiaoyi/shared/domain/ids'
import { parseDraft } from '@xiaoyi/shared/engines/parseDraft'
import { createMemoryMailer } from './auth/mailer'
import { buildApp } from './app'
import { createMemoryStore } from './db/store'

/** 测试用的应用：内存存储 + 内存发信器。 */
function testApp() {
  return buildApp({
    store: createMemoryStore(),
    mailer: createMemoryMailer(),
    siteUrl: 'http://localhost:5173',
    from: 'noreply@xiaoyi.example',
  })
}

const SAMPLE = `张三
前端工程师
手机：138-0000-0000

工作经历
美团 前端工程师 2021.03 - 至今
· 负责活动页的前端开发
`

describe('服务端', () => {
  it('健康检查可用', async () => {
    const app = testApp()
    const response = await app.inject({ method: 'GET', url: '/api/v1/healthz' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('解析简历正文', async () => {
    const app = testApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/draft/parse',
      payload: { text: SAMPLE },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.draft.profile.name).toBe('张三')
    expect(body.draft.sections.length).toBeGreaterThan(0)
  })

  it('正文为空时给出可执行的下一步', async () => {
    const app = testApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/draft/parse',
      payload: { text: '   ' },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('RESUME_EMPTY')
  })

  /**
   * F9 的可执行断言：服务端跑的引擎与直接调用共享包得到**逐字相同**的输出。
   *
   * 这条断言是「同一输入同一输出」的结构保证——如果哪天有人把引擎复制了一份
   * 到服务端，或者让服务端走了另一套实现，这条会立刻红。
   */
  it('解析结果与直接调用共享引擎逐字一致', async () => {
    const app = testApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/draft/parse',
      payload: { text: SAMPLE },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()

    const direct = parseDraft(
      SAMPLE,
      { now: new Date().toISOString(), engineVersion: 'server-0.1.0' },
      createIdSeed(),
    )
    expect(direct.ok).toBe(true)
    if (!direct.ok) return

    expect(body.draft).toEqual(direct.draft)
    expect(body.confidence).toBe(direct.confidence)
    expect(body.warnings).toEqual(direct.warnings)
    expect(body.otherHeaders).toEqual(direct.otherHeaders)
  })
})
