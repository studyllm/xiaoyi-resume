import {
  createLlmGenerator,
  rulesGenerator,
  type ResumeGenerator,
} from '@xiaoyi/shared/engines/generator'

import { describe, expect, it } from 'vitest'

import { createMemoryMailer } from '../auth/mailer'
import { buildApp } from '../app'
import { createMemoryIdempotencyStore } from '../db/idempotency'
import { createMemoryStore } from '../db/store'

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
          start: '2021-03',
          end: null,
          present: true,
          bullets: [{ id: 'bullet-1', text: '主导活动平台前端架构升级，引入 Vue 3 与 Vite' }],
        },
      ],
    },
  ],
}

function versionOf(id: string, name: string) {
  return {
    id,
    userId: '',
    name,
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
    engineVersion: 'x',
    jdRawText: '',
    jdRoleName: '',
    draftRevision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    profile: { name: '张三', headline: '', contacts: [] },
  }
}

function harness(generator: ResumeGenerator = rulesGenerator) {
  const store = createMemoryStore()
  const mailer = createMemoryMailer()
  const app = buildApp({
    generator,
    store,
    idempotency: createMemoryIdempotencyStore(),
    mailer,
    siteUrl: 'http://localhost:5173',
    from: 'noreply@xiaoyi.example',
  })
  return { app, store, mailer }
}

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
  const response = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'someone@example.com', password: PASSWORD },
  })
  return response.cookies[0]!.value
}

describe('简历与版本的端点', () => {
  it('未登录时一律拒绝', async () => {
    const { app } = harness()
    for (const [method, url] of [
      ['GET', '/api/v1/draft'],
      ['PUT', '/api/v1/draft'],
      ['GET', '/api/v1/versions'],
      ['GET', '/api/v1/versions/x'],
      ['DELETE', '/api/v1/versions/x'],
    ] as const) {
      const response = await app.inject({ method, url, payload: method === 'PUT' ? { draft: DRAFT } : undefined })
      expect(response.statusCode, url).toBe(401)
    }
  })

  it('没有底稿时给出「没有简历」那一条', async () => {
    const h = harness()
    const cookie = await login(h)
    const response = await h.app.inject({ method: 'GET', url: '/api/v1/draft', cookies: { session: cookie } })
    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('RESUME_NOT_FOUND')
  })

  it('保存底稿后修订号递增', async () => {
    const h = harness()
    const cookie = await login(h)

    const first = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      payload: { draft: DRAFT },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().revision).toBe(1)

    const read = await h.app.inject({ method: 'GET', url: '/api/v1/draft', cookies: { session: cookie } })
    expect(read.json().draft.profile.name).toBe('张三')
    expect(read.json().revision).toBe(1)
  })

  it('修订号对不上时拒绝覆盖', async () => {
    const h = harness()
    const cookie = await login(h)
    await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      payload: { draft: DRAFT },
    })

    const stale = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      headers: { 'if-match': '0' },
      payload: { draft: DRAFT },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('DRAFT_REVISION_CONFLICT')
  })

  it('版本列表分页，条目是摘要不含正文', async () => {
    const h = harness()
    const cookie = await login(h)
    const user = await h.store.findUserByEmail('someone@example.com')
    await h.store.addVersion({ id: 'v1', userId: user!.id, payload: versionOf('v1', '第一个'), createdAt: new Date('2026-01-01T00:00:00.000Z') })
    await h.store.addVersion({ id: 'v2', userId: user!.id, payload: versionOf('v2', '第二个'), createdAt: new Date('2026-06-01T00:00:00.000Z') })

    const response = await h.app.inject({
      method: 'GET',
      url: '/api/v1/versions?page=1&pageSize=1',
      cookies: { session: cookie },
    })
    const body = response.json()
    expect(body.total).toBe(2)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('v2')
    expect(body.items[0].body).toBeUndefined()
  })

  it('别人的版本看不见', async () => {
    const h = harness()
    const cookie = await login(h)
    const user = await h.store.findUserByEmail('someone@example.com')
    const other = await h.store.createUser({ email: 'other@example.com', passwordHash: 'x' })
    await h.store.addVersion({ id: 'v-other', userId: other.id, payload: versionOf('v-other', '别人的'), createdAt: new Date() })

    const response = await h.app.inject({ method: 'GET', url: '/api/v1/versions', cookies: { session: cookie } })
    expect(response.json().total).toBe(0)
    void user
  })

  it('取版本正文与删版本', async () => {
    const h = harness()
    const cookie = await login(h)
    const user = await h.store.findUserByEmail('someone@example.com')
    await h.store.addVersion({ id: 'v1', userId: user!.id, payload: versionOf('v1', '第一个'), createdAt: new Date() })

    const body = await h.app.inject({
      method: 'GET',
      url: '/api/v1/versions/v1/body?format=markdown',
      cookies: { session: cookie },
    })
    expect(body.json().format).toBe('markdown')

    const missing = await h.app.inject({
      method: 'GET',
      url: '/api/v1/versions/nope',
      cookies: { session: cookie },
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('VERSION_NOT_FOUND')

    const removed = await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/versions/v1',
      cookies: { session: cookie },
    })
    expect(removed.statusCode).toBe(204)
    expect(await h.store.listVersions(user!.id)).toHaveLength(0)
  })
})

describe('生成版本', () => {
  const JD = '前端工程师\n熟悉 Vue 与 TypeScript，有三年以上经验。'

  async function withDraft(h: ReturnType<typeof harness>) {
    const cookie = await login(h)
    await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      payload: { draft: DRAFT },
    })
    return cookie
  }

  it('没底稿时不能生成', async () => {
    const h = harness()
    const cookie = await login(h)
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'k1' },
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
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'k1' },
      payload: { jdText: '   ' },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('JD_EMPTY')
  })

  it('基于已保存的底稿生成，并落库', async () => {
    const h = harness()
    const cookie = await withDraft(h)
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'k1' },
      payload: { jdText: JD },
    })

    expect(response.statusCode).toBe(201)
    const version = response.json().version
    expect(version.userId).toBeTruthy()

    const user = await h.store.findUserByEmail('someone@example.com')
    expect(await h.store.listVersions(user!.id)).toHaveLength(1)
  })

  it('同一个幂等键不会生成两份', async () => {
    const h = harness()
    const cookie = await withDraft(h)
    const payload = { jdText: JD }

    const first = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'same-key' },
      payload,
    })
    const second = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      headers: { 'idempotency-key': 'same-key' },
      payload,
    })

    expect(second.json().version.id).toBe(first.json().version.id)
    const user = await h.store.findUserByEmail('someone@example.com')
    expect(await h.store.listVersions(user!.id)).toHaveLength(1)
  })
})

describe('生成日志', () => {
  it('没说要用模型时，简历不发给任何第三方', async () => {
    let called = 0
    const generator = createLlmGenerator({
      chat: async () => {
        called += 1
        return { text: '{"bullets":[]}' }
      },
      model: 'test-model',
    })
    const h = harness(generator)
    const cookie = await login(h)
    await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      payload: { draft: DRAFT },
    })

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      payload: { jdText: '前端工程师\n\n任职要求：\n1. 熟悉 Vue\n' },
    })

    expect(called).toBe(0)
  })

  it('生成一版就记一条日志', async () => {
    const h = harness()
    const cookie = await login(h)
    await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      payload: { draft: DRAFT },
    })

    await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      payload: { jdText: '前端工程师\n\n任职要求：\n1. 熟悉 Vue\n' },
    })

    const rows = await h.store.listGenerations((await h.store.findUserByEmail('someone@example.com'))!.id)
    expect(rows.length).toBe(1)
    expect(rows[0]!.engine).toBe('rules')
    expect(rows[0]!.status).toBe('ok')
    expect(rows[0]!.jdHash.length).toBe(32)
  })

  it('模型不可用时版本照样生成，标记为降级', async () => {
    const generator = createLlmGenerator({
      chat: async () => {
        throw new Error('模型超时')
      },
      model: 'test-model',
    })
    const h = harness(generator)
    const cookie = await login(h)
    await h.app.inject({
      method: 'PUT',
      url: '/api/v1/draft',
      cookies: { session: cookie },
      payload: { draft: DRAFT },
    })

    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/versions',
      cookies: { session: cookie },
      payload: {
        jdText: '前端工程师\n\n任职要求：\n1. 熟悉 Vue\n',
        options: { useLlm: true },
      },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json() as { version: { integrity: { generator: string; degraded: boolean } } }
    expect(body.version.integrity.generator).toBe('rules')
    expect(body.version.integrity.degraded).toBe(true)

    const userId = (await h.store.findUserByEmail('someone@example.com'))!.id
    const rows = await h.store.listGenerations(userId)
    expect(rows[0]!.status).toBe('error')
    expect(rows[0]!.error).toBe('模型超时')
  })
})
