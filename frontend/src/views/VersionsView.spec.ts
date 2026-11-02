// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useSessionStore } from '@/stores/session'
import { useVersionStore } from '@/stores/versions'
import VersionsView from './VersionsView.vue'

async function mountVersions() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().login('张三')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/versions', component: VersionsView },
      { path: '/draft', component: { template: '<div />' } },
      { path: '/jd', component: { template: '<div />' } },
      { path: '/import', component: { template: '<div />' } },
      { path: '/versions/:id', component: { template: '<div />' } },
      { path: '/versions/:id/print', component: { template: '<div />' } },
    ],
  })
  await router.push('/versions')
  await router.isReady()

  const wrapper = mount(VersionsView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, store: useVersionStore() }
}

describe('VersionsView 的卡片', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('没有版本时给出空状态', async () => {
    const { wrapper } = await mountVersions()
    expect(wrapper.findAll('.version-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('还没有生成任何版本')
  })

  it('生成时间一行，操作按钮另起一行', async () => {
    const { wrapper, store } = await mountVersions()
    store.generate(
      {
        id: 'draft-1',
        userId: 'user-1',
        revision: 1,
        profile: { name: '张三', headline: '', contacts: [] },
        sections: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      '前端工程师\n负责前端架构与团队协作',
    )
    await flushPromises()

    const meta = wrapper.find('.version-card-meta')
    const actions = wrapper.find('.version-card-actions')
    expect(meta.exists()).toBe(true)
    expect(actions.exists()).toBe(true)
    expect(meta.text()).toContain('生成于')
    expect(meta.findAll('button')).toHaveLength(0)
    expect(actions.findAll('button').length).toBeGreaterThan(0)
    // 两块是上下两行，不在同一行里
    expect(meta.element.compareDocumentPosition(actions.element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('卡片上的操作按钮都带图标', async () => {
    const { wrapper, store } = await mountVersions()
    store.generate(
      {
        id: 'draft-1',
        userId: 'user-1',
        revision: 1,
        profile: { name: '张三', headline: '', contacts: [] },
        sections: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      '前端工程师\n负责前端架构与团队协作',
    )
    await flushPromises()

    const buttons = wrapper.findAll('.version-card-actions button')
    expect(buttons).toHaveLength(4)
    for (const button of buttons) {
      expect(button.find('.el-icon').exists()).toBe(true)
    }
  })

  it('操作按钮与生成时间左对齐，并在行内均分', () => {
    const source = readFileSync(join(process.cwd(), 'src/views/VersionsView.vue'), 'utf8')
    // 按钮自身的内边距会让第一个图标缩进去，归零后才跟生成时间对齐
    expect(source).toContain('.version-card-actions :deep(.el-button)')
    expect(source).toContain('padding-left: 0')
    expect(source).toContain('padding-right: 0')
    // 均分：第一个贴左（与生成时间对齐），最后一个贴右
    expect(source).toContain('justify-content: space-between')
  })

  it('删除入口是垃圾桶图标', async () => {
    const { wrapper, store } = await mountVersions()
    store.generate(
      {
        id: 'draft-1',
        userId: 'user-1',
        revision: 1,
        profile: { name: '张三', headline: '', contacts: [] },
        sections: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      '前端工程师\n负责前端架构与团队协作',
    )
    await flushPromises()

    const remove = wrapper.find('.version-card .paper-delete')
    expect(remove.exists()).toBe(true)
    expect(remove.find('.el-icon').exists()).toBe(true)
    expect(remove.text().trim()).toBe('删除')
  })
})
