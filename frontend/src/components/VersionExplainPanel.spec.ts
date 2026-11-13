// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { VersionExplain } from '@xiaoyi/shared/domain/types'
import VersionExplainPanel from './VersionExplainPanel.vue'

function bullet(index: number) {
  return {
    bulletId: `b-${index}`,
    sectionKind: 'experience' as const,
    sectionTitle: '工作经历',
    itemLabel: '美团 · 前端工程师',
    outcome: 'keep' as const,
    reason: '与简历一致，原样保留',
    compared: true,
    matchedRequirements: ['熟悉 React 与 TypeScript'],
    writtenBy: 'rules' as const,
  }
}

function explain(overrides: Partial<VersionExplain> = {}): VersionExplain {
  return {
    pipeline: {
      requirementCount: 12,
      totalBullets: 77,
      comparedBullets: 40,
      keptBullets: 28,
      modelRewritten: 22,
      reverted: 3,
      checked: 28,
    },
    bullets: [bullet(1)],
    rewrites: [],
    model: {
      calls: [
        {
          stage: 'analyze',
          model: 'model-x',
          promptVersion: 'llm-jd-analysis-v2',
          bulletsSent: 40,
          promptTokens: 8200,
          completionTokens: 1100,
          degraded: false,
          degradeReason: null,
        },
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  const pinia = createPinia()
  setActivePinia(pinia)
})

describe('这一版是怎么来的', () => {
  it('没有记录生成过程的版本显示空态', async () => {
    const wrapper = mount(VersionExplainPanel, { props: { explain: undefined } })
    await flushPromises()

    expect(wrapper.text()).toContain('这一版生成时没有记录生成过程')
    expect(wrapper.text()).not.toContain('要点取舍')
  })

  it('展示生成经过的四个区块', async () => {
    const wrapper = mount(VersionExplainPanel, {
      props: {
        explain: explain({
          rewrites: [
            {
              bulletId: 'b-1',
              modelText: '模型写的那句',
              finalText: '规则引擎写的那句',
              rejectedKind: 'number-mismatch',
              rejectedReason: '数字对不上',
            },
          ],
        }),
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('生成经过')
    expect(wrapper.text()).toContain('模型调用')
    expect(wrapper.text()).toContain('要点取舍')
    expect(wrapper.text()).toContain('模型改写与换回')
  })

  it('生成经过里的条数与数据一致', async () => {
    const wrapper = mount(VersionExplainPanel, { props: { explain: explain() } })
    await flushPromises()

    expect(wrapper.text()).toContain('抽到 12 条要求')
    expect(wrapper.text()).toContain('比对了 40 条要点（简历里共 77 条）')
    expect(wrapper.text()).toContain('进了这一版 28 条')
    expect(wrapper.text()).toContain('有 3 处没有通过校验')
  })

  it('没用模型时说明这次全部由规则引擎生成', async () => {
    const wrapper = mount(VersionExplainPanel, {
      props: { explain: explain({ model: { calls: [] } }) },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('这次没有用模型，全部由规则引擎生成')
    expect(wrapper.text()).not.toContain('模型调用')
  })

  it('要点超过二十条时折叠，点开才全渲染', async () => {
    const wrapper = mount(VersionExplainPanel, {
      props: { explain: explain({ bullets: Array.from({ length: 25 }, (_, i) => bullet(i)) }) },
    })
    await flushPromises()

    // 每行的「依据」都写着同一句话——数它就知道渲染了几条
    const rendered = () => wrapper.text().split('与简历一致，原样保留').length - 1
    expect(rendered()).toBe(20)

    await wrapper.find('.explain-more button').trigger('click')
    await flushPromises()
    expect(rendered()).toBe(25)
  })

  it('看改动对照会通知外面切页签', async () => {
    const wrapper = mount(VersionExplainPanel, { props: { explain: explain() } })
    await flushPromises()

    const button = wrapper
      .findAll('button')
      .find((entry) => entry.text() === '看改动对照')
    expect(button).toBeDefined()
    await button!.trigger('click')

    expect(wrapper.emitted('gotoDiff')).toBeTruthy()
  })
})
