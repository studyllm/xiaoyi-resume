import { rulesGenerator } from '@xiaoyi/shared/engines/generator'

import { describe, expect, it } from 'vitest'

import { createMemoryMailer } from '../auth/mailer'
import { buildApp } from '../app'
import { createMemoryIdempotencyStore } from '../db/idempotency'
import { createMemoryStore } from '../db/store'

const PASSWORD = 'correct horse battery'

function harness() {
  const mailer = createMemoryMailer()
  const store = createMemoryStore()
  const app = buildApp({
    generator: rulesGenerator,
    store,
    idempotency: createMemoryIdempotencyStore(),
    mailer,
    siteUrl: 'http://localhost:5173',
    from: 'noreply@xiaoyi.example',
  })
  return { app, store, mailer }
}

/** 注册并验证，返回一个已登录的 cookie 值。 */
async function login(h: ReturnType<typeof harness>): Promise<string> {
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: 'someone@example.com', password: PASSWORD },
  })
  const token = /token=([^\s&]+)/.exec(h.mailer.sent[0]!.text)![1]!
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: { token: decodeURIComponent(token) },
  })
  const login = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'someone@example.com', password: PASSWORD },
  })
  return login.cookies[0]!.value
}

const DRAFT = {
  id: 'draft-1',
  userId: '',
  revision: 1,
  profile: { name: '张三', headline: '', contacts: [] },
  sections: [{ id: 'section-1', kind: 'experience', title: '工作经历', items: [] }],
}

const VERSION = {
  id: 'ver-1',
  userId: '',
  name: '美团 前端工程师',
  body: '工作经历',
  sections: [],
  diff: [],
  uncovered: [],
  coverage: [],
  integrity: {
      checked: 0,
      violations: [],
      generator: 'rules' as const,
      reverted: 0,
      degraded: false,
      observations: [],
    },
  engineVersion: 'mock-0.1.0',
  jdRawText: '',
  jdRoleName: '',
  draftRevision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  profile: { name: '张三', headline: '', contacts: [] },
}

describe('迁移本地存量数据', () => {
  it('未登录时不能迁移', async () => {
    const h = harness()
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/draft/import-local',
      payload: { draft: null, versions: [] },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('AUTH_REQUIRED')
  })

  it('底稿与版本都搬过来', async () => {
    const h = harness()
    const cookie = await login(h)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/draft/import-local',
      cookies: { session: cookie },
      payload: {
        draft: { v: 3, data: DRAFT },
        versions: [{ v: 3, data: VERSION }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ draft: true, versions: 1, discarded: [] })

    const user = await h.store.findUserByEmail('someone@example.com')
    const draft = await h.store.getDraft(user!.id)
    expect(draft?.payload.profile.name).toBe('张三')
    expect(draft?.revision).toBe(1)
  })

  it('一个版本坏了不影响其余：丢掉那一个，其余照常搬', async () => {
    const h = harness()
    const cookie = await login(h)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/draft/import-local',
      cookies: { session: cookie },
      payload: {
        draft: { v: 3, data: DRAFT },
        versions: [{ v: 3, data: { broken: true } }, { v: 3, data: VERSION }],
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.versions).toBe(1)
    expect(body.discarded).toHaveLength(1)
    expect(body.discarded[0].reason).toContain('认不出来')
  })

  it('底稿结构认不出来时只丢底稿，版本照常搬', async () => {
    const h = harness()
    const cookie = await login(h)

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/draft/import-local',
      cookies: { session: cookie },
      payload: {
        draft: { v: 3, data: { broken: true } },
        versions: [{ v: 3, data: VERSION }],
      },
    })

    const body = response.json()
    expect(body.draft).toBe(false)
    expect(body.versions).toBe(1)
    expect(body.discarded).toHaveLength(1)
  })
})
