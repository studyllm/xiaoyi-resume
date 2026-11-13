import { describe, expect, it } from 'vitest'

import type { Draft } from '../domain/types'
import { SECTION_ORDER, SECTION_TITLES } from '../domain/types'
import { buildJdAnalysisPrompt, toPromptBullets } from './jdAnalysisPrompt'

function makeDraft(): Draft {
  return {
    id: 'draft-1',
    userId: 'user-1',
    revision: 1,
    profile: { name: '张三', headline: '前端工程师', contacts: [{ label: '手机', value: '13800000000' }] },
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: SECTION_ORDER.map((kind) => ({
      id: `sec-${kind}`,
      kind,
      title: SECTION_TITLES[kind],
      items:
        kind === 'experience'
          ? [
              {
                id: 'item-1',
                org: '美团',
                title: '前端工程师',
                start: null,
                end: null,
                present: true,
                bullets: [
                  { id: 'bullet-1', text: '主导活动平台前端架构升级，引入 Vue 3' },
                  { id: 'bullet-2', text: '负责周会组织与文档整理' },
                  { id: 'bullet-3', text: '负责容器镜像构建与 CI/CD 流程接入' },
                ],
              },
            ]
          : [],
    })),
  }
}

describe('比对提示词的形状', () => {
  it('给的是要点序号，不是要点 id', () => {
    const bullets = toPromptBullets(makeDraft())

    expect(bullets[0]!.ordinal).toBe(1)
    expect(bullets[0]!.text).toContain('Vue 3')

    const prompt = buildJdAnalysisPrompt({ jdText: '前端工程师', bullets })
    expect(prompt.user).toContain('要点 1')
    expect(prompt.user).not.toContain('bullet-1')
  })

  it('提示词里没有姓名与联系方式', () => {
    const prompt = buildJdAnalysisPrompt({
      jdText: '前端工程师',
      bullets: toPromptBullets(makeDraft()),
    })

    expect(prompt.user).not.toContain('张三')
    expect(prompt.user).not.toContain('13800000000')
    expect(prompt.user).not.toContain('前端工程师 |')
  })

  it('JD 全文照发', () => {
    const jdText = '前端工程师\n任职要求：\n1. 精通 Vue 与 TypeScript'
    const prompt = buildJdAnalysisPrompt({ jdText, bullets: toPromptBullets(makeDraft()) })

    expect(prompt.user).toContain('精通 Vue 与 TypeScript')
  })

  it('只发选中的要点，但保留整份简历里的原序号', () => {
    const bullets = toPromptBullets(makeDraft(), {
      includeBulletIds: new Set(['bullet-1', 'bullet-3']),
    })

    // 第 2 条没参与比对——序号因此跳号，不重编
    expect(bullets.map((bullet) => bullet.ordinal)).toEqual([1, 3])

    const prompt = buildJdAnalysisPrompt({ jdText: '前端工程师', bullets })
    expect(prompt.user).toContain('要点 1')
    expect(prompt.user).toContain('要点 3')
    expect(prompt.user).not.toContain('要点 2')
    expect(prompt.user).toContain('被略过的是与这个岗位无关的要点')
  })

  it('提示词里说清编号是整份简历里的位置', () => {
    const prompt = buildJdAnalysisPrompt({
      jdText: '前端工程师',
      bullets: toPromptBullets(makeDraft()),
    })

    expect(prompt.system).toContain('序号是这条要点在整份简历里的位置')
  })
})
