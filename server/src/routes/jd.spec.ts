import { describe, expect, it } from 'vitest'

import { rulesGenerator } from '@xiaoyi/shared/engines/generator'
import { rulesJdAnalyzer } from '@xiaoyi/shared/engines/jdAnalysis'

import { createMemoryMailer } from '../auth/mailer'
import { buildApp } from '../app'
import { createMemoryIdempotencyStore } from '../db/idempotency'
import { createMemoryStore, hashToken } from '../db/store'

const PASSWORD = 'correct horse battery'

const DRAFT = {
  id: 'draft-1',
  userId: '',
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  profile: { name: '张三', headline: '前端工程师', contacts: [] },
  sections: [
    {
      id: 'section-1',
      kind: 'experience',
      title: '工作经历',
      items: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: null,
          end: null,
          present: true,
          bullets: [{ id: 'bullet-1', text: '主导活动平台前端架构升级，引入 Vue 3' }],
        },
      ],
    },
  ],
}

const JD = '前端工程师\n\n任职要求：\n1. 熟悉 Vue 与 TypeScript\n'

function harness() {
  const store = createMemoryStore()
  const mailer = createMemoryMailer()
  const app = buildApp({
    llm: null,
    generator: rulesGenerator,
    analyzer: rulesJdAnalyzer,
    store,
    idempotency: createMemoryIdempotencyStore(),
    mailer,
    siteUrl: 'http://localhost:5173',
    from: 'noreply@xiaoyi.example',
  })
  return { app, store, mailer }
}

/** 给指定用户造一个会话 cookie。 */
async function sessionFor(
  h: ReturnType<typeof harness>,
  userId: string,
): Promise<string> {
  const token = 'test-session-token'
  await h.store.createSession({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  })
  return token
}

async function login(h: ReturnType<typeof harness>): Promise<string> {
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
  })
  const token = /token=([^\s&]+)/.exec(h.mailer.sent[0]!.text)![1]!
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: { token: decodeURIComponent(token) },
  })
  const response = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'someone@example.com', password: PASSWORD },
  })
  return response.cookies[0]!.value
}

async function withDraft(h: ReturnType<typeof harness>): Promise<string> {
  const cookie = await login(h)
  await h.app.inject({
    method: 'PUT',
    url: '/api/v1/draft',
    cookies: { session: cookie },
    payload: { draft: DRAFT },
  })
  return cookie
}

describe('JD 比对的端点', () => {
  it('未登录时拒绝', async () => {
    const h = harness()
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      payload: { jdText: JD },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('AUTH_REQUIRED')
  })

  it('没有底稿时给出「没有简历」那一条', async () => {
    const h = harness()
    const cookie = await login(h)
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('RESUME_NOT_FOUND')
  })

  it('JD 为空时给出可执行的下一步', async () => {
    const h = harness()
    const cookie = await withDraft(h)
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: '   ' },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('JD_EMPTY')
  })

  it('返回要求、命中情况与岗位名', async () => {
    const h = harness()
    const cookie = await withDraft(h)
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.roleName).toBe('前端工程师')
    expect(body.requirements.length).toBeGreaterThan(0)
    expect(body.coverage.length).toBeGreaterThan(0)
    // 没配供应商 → 走规则目录，并标出来
    expect(body.engine).toBe('rules')
    expect(body.degraded).toBe(false)
  })

  it('同一份输入只算一次', async () => {
    const h = harness()
    const cookie = await withDraft(h)

    const first = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD },
    })
    const second = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD },
    })

    // 同一把键 → 同一份结果
    expect(second.json().analysisId).toBe(first.json().analysisId)
    expect(second.json().coverage).toEqual(first.json().coverage)
  })

  it('换了 JD 就是另一次分析', async () => {
    const h = harness()
    const cookie = await withDraft(h)

    const first = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD },
    })
    const second = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: '后端工程师\n\n任职要求：\n1. 熟悉 Java\n' },
    })

    expect(second.json().analysisId).not.toBe(first.json().analysisId)
  })

  it('账号没同意过时，客户端传 useLlm 也不走模型', async () => {
    const h = harness()
    // 造一个没有同意记录的账号
    const user = await h.store.createUser({ email: 'old@example.com', passwordHash: 'x' })
    await h.store.saveDraft({
      userId: user.id,
      payload: DRAFT as never,
      revision: 1,
    })
    const cookie = await sessionFor(h, user.id)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD, options: { useLlm: true } },
    })

    expect(response.statusCode).toBe(200)
    // 服务端不认客户端的开关——没同意就走规则目录
    expect(response.json().engine).toBe('rules')
  })

  it('版本生成也不认客户端的开关', async () => {
    const h = harness()
    const user = await h.store.createUser({ email: 'old@example.com', passwordHash: 'x' })
    await h.store.saveDraft({
      userId: user.id,
      payload: DRAFT as never,
      revision: 1,
    })
    const cookie = await sessionFor(h, user.id)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'k1' },
      payload: { jdText: JD, options: { useLlm: true } },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().version.coverageEngine).toBe('rules')
  })

  it('版本生成用的是同一份分析', async () => {
    const h = harness()
    const cookie = await withDraft(h)

    const analyzed = await h.app.inject({
      method: 'POST',
      url: '/api/v1/jd/analyze',
      cookies: { session: cookie },
      payload: { jdText: JD },
    })
    const generated = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'k1' },
      payload: { jdText: JD },
    })

    expect(generated.statusCode).toBe(201)
    const version = generated.json().version
    // 版本里的覆盖结论与第二步看到的一致
    expect(version.coverage).toEqual(analyzed.json().coverage)
    expect(version.coverageEngine).toBe('rules')
  })
})

describe('同意模型供应商', () => {
  it('注册时必须单独勾选', async () => {
    const h = harness()
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_FAILED')
    // 没建账号
    expect(await h.store.findUserByEmail('someone@example.com')).toBeNull()
  })

  it('注册时勾了就把同意记下', async () => {
    const h = harness()
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'someone@example.com', password: PASSWORD, consent: true },
    })

    const user = await h.store.findUserByEmail('someone@example.com')
    expect(user).not.toBeNull()
    expect(await h.store.modelConsentAt(user!.id)).toBeInstanceOf(Date)
  })

  it('登录后能查到同意状态', async () => {
    const h = harness()
    const cookie = await login(h)

    const response = await h.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { session: cookie },
    })

    expect(response.json().modelConsentAt).toBeTruthy()
  })

  it('老账号可以补记同意', async () => {
    const h = harness()
    // 造一个没有同意记录的账号
    const user = await h.store.createUser({
      email: 'old@example.com',
      passwordHash: 'x',
    })
    expect(await h.store.modelConsentAt(user.id)).toBeNull()

    const cookie = await sessionFor(h, user.id)
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/me/model-consent',
      cookies: { session: cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(await h.store.modelConsentAt(user.id)).toBeInstanceOf(Date)
  })
})
