import { describe, expect, it } from 'vitest'

import { createIdSeed } from '@/domain/ids'
import type { Draft, DraftItem, SectionKind } from '@/domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '@/domain/types'
import { generateVersion } from './generateVersion'
import { parseDraft } from './parseDraft'

const CTX = { now: '2026-01-01T00:00:00.000Z', engineVersion: 'test' }

interface ItemSpec {
  id: string
  org?: string
  title?: string
  start?: string | null
  end?: string | null
  present?: boolean
  bullets?: string[]
}

function makeItem(spec: ItemSpec): DraftItem {
  return {
    id: spec.id,
    org: spec.org,
    title: spec.title,
    start: spec.start ?? null,
    end: spec.end ?? null,
    present: spec.present ?? false,
    bullets: (spec.bullets ?? []).map((text, index) => ({
      id: `${spec.id}-b${index + 1}`,
      text,
    })),
  }
}

function makeDraft(sections: Partial<Record<SectionKind, ItemSpec[]>>): Draft {
  return {
    id: 'draft-1',
    userId: 'user-1',
    revision: 3,
    profile: { name: '', headline: '', contacts: [] },
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: SECTION_ORDER.map((kind) => ({
      id: `sec-${kind}`,
      kind,
      title: SECTION_TITLES[kind],
      items: (sections[kind] ?? []).map(makeItem),
    })),
  }
}

const JD = `前端工程师

任职要求：
1. 精通 Vue 和 TypeScript
2. 熟悉 Docker 与 CI/CD 流程
3. 具备高并发场景下的性能优化经验
`

const DRAFT = makeDraft({
  experience: [
    {
      id: 'item-1',
      org: '美团',
      title: '前端工程师',
      start: '2021-03',
      present: true,
      bullets: [
        '主导活动平台前端架构升级，引入 Vue 3 与 Vite，页面构建时间从 120s 降到 18s',
        '负责公司营销活动页面的前端开发',
        '参与容器镜像构建，配合运维完成 CI/CD 流程接入',
        '负责日常需求开发',
      ],
    },
  ],
  skills: [{ id: 'item-2', bullets: ['前端：Vue、React、TypeScript'] }],
})

function numbersOf(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0])
}

describe('generateVersion', () => {
  it('names the version after the role found in the job description', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    expect(version.name).toBe('前端工程师')
  })

  it('uses the name supplied by the caller', () => {
    const { version } = generateVersion(DRAFT, JD, CTX, { versionName: '我的版本' })
    expect(version.name).toBe('我的版本')
  })

  it('rates a requirement as strongly covered when a bullet shows a result', () => {
    const { coverage } = generateVersion(DRAFT, JD, CTX)
    const requirement = coverage.find((entry) => entry.text.includes('Vue'))
    expect(requirement!.tier).toBe('strong')
  })

  it('rates a requirement as weakly covered when the bullet shows no result', () => {
    const { coverage } = generateVersion(DRAFT, JD, CTX)
    const requirement = coverage.find((entry) => entry.text.includes('Docker'))
    expect(requirement!.tier).toBe('weak')
  })

  it('rates a requirement that has no matching fact as not covered', () => {
    const { coverage } = generateVersion(DRAFT, JD, CTX)
    const requirement = coverage.find((entry) => entry.text.includes('高并发'))
    expect(requirement!.tier).toBe('none')
    expect(requirement!.reason).toBe('no-match')
  })

  it('lists the requirement that has no matching fact', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    const uncovered = version.uncovered.find((entry) => entry.text.includes('高并发'))
    expect(uncovered).toBeDefined()
    expect(uncovered!.text).toBe('具备高并发场景下的性能优化经验')
  })

  it('treats a planned statement as no matching fact', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['计划在下一阶段接入 Redis 与 Kafka'],
        },
      ],
    })
    const { coverage } = generateVersion(draft, '任职要求：\n1. 熟悉 Redis 与 Kafka', CTX)
    const requirement = coverage.find((entry) => entry.text.includes('Redis'))
    expect(requirement!.tier).toBe('none')
    expect(requirement!.reason).toBe('planned-only')
  })

  it('moves the relevant bullet to the front of the entry', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    const item = version.sections
      .flatMap((section) => section.items)
      .find((candidate) => candidate.id === 'item-1')!
    expect(item.bullets[0]!.text).toContain('Vue 3')
  })

  it('keeps the original order of an entry without any relevant bullet', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: ['负责公司营销活动页面的前端开发', '负责日常需求开发'],
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX)
    const item = version.sections
      .flatMap((section) => section.items)
      .find((candidate) => candidate.id === 'item-1')!
    expect(item.bullets.map((bullet) => bullet.text)).toEqual([
      '负责公司营销活动页面的前端开发',
      '负责日常需求开发',
    ])
  })

  it('never pushes the first two bullets of an entry to the end', () => {
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets: [
            '负责公司营销活动页面的前端开发',
            '负责日常需求开发',
            '使用 Vue 重写构建流程，构建时间从 120s 降到 18s',
            '参与需求评审',
          ],
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX)
    const item = version.sections
      .flatMap((section) => section.items)
      .find((candidate) => candidate.id === 'item-1')!
    const texts = item.bullets.map((bullet) => bullet.text)
    expect(texts[texts.length - 1]).not.toBe('负责公司营销活动页面的前端开发')
    expect(texts[texts.length - 1]).not.toBe('负责日常需求开发')
  })

  it('moves at most sixty percent of the bullets to the end', () => {
    const bullets = [
      '负责公司营销活动页面的前端开发',
      '负责日常需求开发',
      '使用 Vue 重写构建流程，构建时间从 120s 降到 18s',
      '跟进需求交付进度',
      '整理季度归档材料',
      '对接产品与设计团队',
      '维护需求说明材料',
      '承接跨组协作事项',
    ]
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets,
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX, { maxBulletsPerItem: 20 })
    const moved = version.diff.filter((entry) => entry.placement === 'to-end').length
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBe(Math.floor(bullets.length * 0.6))
  })

  it('produces one diff entry for every bullet of the draft', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    const draftBulletIds = DRAFT.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id)),
    )
    expect(version.diff).toHaveLength(draftBulletIds.length)
    expect(version.diff.map((entry) => entry.bulletId).sort()).toEqual(draftBulletIds.sort())
  })

  it('marks a bullet that moved to the end as moved and not as removed', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    const entry = version.diff.find((item) => item.bulletId === 'item-1-b4')!
    expect(entry.change).not.toBe('remove')
    expect(entry.placement).toBe('to-end')
    expect(entry.toText).not.toBeNull()
    expect(entry.toIndex).not.toBeNull()
  })

  it('marks a removed bullet as removed with no target text', () => {
    const bullets = Array.from({ length: 9 }, (_, index) => `第 ${index} 条要点`)
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets,
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX)
    const removed = version.diff.filter((entry) => entry.change === 'remove')
    expect(removed.length).toBeGreaterThan(0)
    for (const entry of removed) {
      expect(entry.toText).toBeNull()
      expect(entry.toIndex).toBeNull()
    }
  })

  it('keeps at most six bullets inside one entry', () => {
    const bullets = Array.from({ length: 9 }, (_, index) => `使用 Vue 完成第 ${index} 项改造`)
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets,
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX)
    const item = version.sections
      .flatMap((section) => section.items)
      .find((candidate) => candidate.id === 'item-1')!
    expect(item.bullets.length).toBeLessThanOrEqual(6)
  })

  it('keeps every number of the version inside the draft', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    const draftNumbers = new Set(numbersOf(JSON.stringify(DRAFT)))
    for (const number of numbersOf(version.body)) {
      expect(draftNumbers.has(number)).toBe(true)
    }
  })

  it('passes the invariant check for every rewritten bullet', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    expect(version.integrity.violations).toEqual([])
    expect(version.integrity.checked).toBeGreaterThan(0)
  })

  it('never adds a fact that the draft does not hold', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    expect(version.body).not.toContain('Redis')
    expect(version.body).not.toContain('Kafka')
  })

  it('produces the same version twice for the same input', () => {
    const first = generateVersion(DRAFT, JD, CTX)
    const second = generateVersion(DRAFT, JD, CTX)
    expect(first.version.body).toBe(second.version.body)
    expect(JSON.stringify(first.version.diff)).toBe(JSON.stringify(second.version.diff))
  })

  it('assembles a body that can be parsed again', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    const parsed = parseDraft(version.body, CTX, createIdSeed())
    expect(parsed.ok).toBe(true)
    expect(parsed.draft!.sections.find((section) => section.kind === 'experience')!.items).toHaveLength(1)
  })

  it('writes the body with section titles and bullet markers', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    expect(version.body).toContain('工作经历')
    expect(version.body).toContain('· ')
    expect(version.body).toContain('美团')
  })

  it('keeps the draft untouched', () => {
    const before = JSON.stringify(DRAFT)
    generateVersion(DRAFT, JD, CTX)
    expect(JSON.stringify(DRAFT)).toBe(before)
  })

  it('carries the coverage grading on the version', () => {
    const { version, coverage } = generateVersion(DRAFT, JD, CTX)
    expect(version.coverage).toHaveLength(coverage.length)
    expect(version.coverage.some((entry) => entry.tier === 'strong')).toBe(true)
    expect(version.coverage.some((entry) => entry.tier === 'none')).toBe(true)
  })

  it('puts the profile at the top of the plain text body', () => {
    const draft = { ...DRAFT, profile: { name: '张三', headline: '前端工程师', contacts: [] } }
    const { version } = generateVersion(draft, JD, CTX)
    expect(version.body.startsWith('张三')).toBe(true)
    expect(version.body).toContain('前端工程师')
  })

  it('keeps the plain text body parseable after the profile is added', () => {
    const draft = {
      ...DRAFT,
      profile: {
        name: '张三',
        headline: '前端工程师',
        contacts: [{ label: '手机', value: '138-0000-0000' }],
      },
    }
    const { version } = generateVersion(draft, JD, CTX)
    const reparsed = parseDraft(version.body, CTX, createIdSeed())
    expect(reparsed.ok).toBe(true)
    expect(reparsed.draft!.profile.name).toBe('张三')
    expect(reparsed.draft!.sections.find((s) => s.kind === 'experience')!.items).toHaveLength(1)
  })

  it('records the draft revision the version was built from', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    expect(version.draftRevision).toBe(DRAFT.revision)
  })

  it('keeps the job description the version was built from', () => {
    const { version } = generateVersion(DRAFT, JD, CTX)
    expect(version.jdRawText).toBe(JD)
  })
  it('keeps a bullet that carries the only matching fact even when the entry is too long', () => {
    const bullets = [
      '使用 Vue 与 React 与 TypeScript 与 Webpack 完成组件库改造',
      '使用 Redis 做过一次缓存改造',
      '使用 Vite 与 Node.js 与 Docker 与 MySQL 完成工程化改造',
      '使用 Nginx 与 Linux 与 Shell 与 Kafka 完成部署改造',
      '使用 Prometheus 与 Grafana 与 ELK 与 Maven 完成监控改造',
      '使用 Python 与 Django 与 Flask 与 Celery 完成服务端改造',
      '使用 GraphQL 与 Apollo 与 Prisma 与 Jest 完成接口改造',
    ]
    const draft = makeDraft({
      experience: [
        {
          id: 'item-1',
          org: '美团',
          title: '前端工程师',
          start: '2021-03',
          present: true,
          bullets,
        },
      ],
    })
    const { version, coverage } = generateVersion(draft, '任职要求：\n1. 熟悉 Redis', CTX)
    const requirement = coverage.find((entry) => entry.text.includes('Redis'))
    expect(requirement!.tier).toBe('weak')
    expect(version.body).toContain('Redis')
    const removed = version.diff.filter((entry) => entry.change === 'remove')
    expect(removed.map((entry) => entry.bulletId)).not.toContain('item-1-b2')
  })

  it('drops a project that has nothing to do with the job description', () => {
    const draft = makeDraft({
      project: [
        {
          id: 'item-1',
          org: '经营数据可视化大屏',
          start: '2022-05',
          end: '2022-11',
          bullets: ['使用 Vue 与 ECharts 实现大屏，支持 12 个业务主题'],
        },
        {
          id: 'item-2',
          org: '门店物料管理系统',
          start: '2021-02',
          end: '2021-08',
          bullets: ['负责门店物料的登记与核对'],
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX)
    const dropped = version.diff.find((entry) => entry.bulletId === 'item-2-b1')!
    expect(dropped.change).toBe('remove')
    expect(dropped.toText).toBeNull()
    expect(version.body).not.toContain('门店物料管理系统')
  })

  it('keeps a project that is not relevant when the option is off', () => {
    const draft = makeDraft({
      project: [
        {
          id: 'item-1',
          org: '经营数据可视化大屏',
          start: '2022-05',
          end: '2022-11',
          bullets: ['使用 Vue 与 ECharts 实现大屏，支持 12 个业务主题'],
        },
        {
          id: 'item-2',
          org: '门店物料管理系统',
          start: '2021-02',
          end: '2021-08',
          bullets: ['负责门店物料的登记与核对'],
        },
      ],
    })
    const { version } = generateVersion(draft, JD, CTX, { dropIrrelevantProjects: false })
    expect(version.body).toContain('门店物料管理系统')
  })
})
