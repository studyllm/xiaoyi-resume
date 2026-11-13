import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ResumeVersion } from '@xiaoyi/shared/domain/types'
import type { GenerateOptions } from '@xiaoyi/shared/engines/types'
import { createVersion, deleteVersion, fetchVersion, fetchVersions } from '@/api/resume'
import { persistence, versionsKey } from './persistence'
import { useDraftStore } from './draft'
import { useSessionStore } from './session'

export const useVersionStore = defineStore('versions', () => {
  const versions = ref<ResumeVersion[]>([])

  const count = computed(() => versions.value.length)

  /**
   * 读版本列表。
   *
   * **服务端是权威**（ADR-0004）：先问服务端。连不上就退回本地缓存——
   * 本地那份是只读缓存，断网时还能看到上次的版本，但改不动也存不了。
   */
  async function restore(): Promise<void> {
    const run = doRestore()
    restoring = run
    try {
      await run
    } finally {
      if (restoring === run) restoring = null
    }
  }

  /** 正在进行的重载。生成前要等它完成。 */
  let restoring: Promise<void> | null = null

  async function doRestore(): Promise<void> {
    const session = useSessionStore()
    const userId = session.currentUserId
    if (!userId) {
      versions.value = []
      return
    }

    try {
      const result = await fetchVersions()
      versions.value = result.items
      // 本地留一份只读缓存：断网时还能看到上次的版本
      persistence.write(versionsKey(userId), result.items)
      session.offline = false
      return
    } catch {
      session.offline = true
    }

    // 连不上：退回本地缓存，只读
    const cached = persistence.read<ResumeVersion[]>(versionsKey(userId))
    if (cached) versions.value = cached
  }

  /**
   * 生成版本。
   *
   * **服务端生成**（ADR-0004）：客户端不提交算好的结构化简历。服务端读已保存的
   * 底稿、跑引擎、落库。
   */
  async function generate(
    jdText: string,
    options: GenerateOptions = {},
  ): Promise<ResumeVersion> {
    const session = useSessionStore()
    if (!session.isLoggedIn) {
      throw new Error('需要登录后才能生成版本')
    }

    if (restoring) await restoring

    const draftStore = useDraftStore()
    // 版本必须基于已保存的内容，修订号才对得上
    await draftStore.saveIfDirty()

    const result = await createVersion({
      jdText,
      options: {
        allowVerbFronting: options.allowVerbFronting,
        dropIrrelevantProjects: options.dropIrrelevantProjects,
        useLlm: options.useLlm === true,
      },
      idempotencyKey: crypto.randomUUID(),
    })

    const version = result.version
    versions.value = [version, ...versions.value]
    if (session.currentUserId) {
      persistence.write(versionsKey(session.currentUserId), versions.value)
    }
    return version
  }

  async function remove(id: string): Promise<void> {
    const session = useSessionStore()
    await deleteVersion(id)
    versions.value = versions.value.filter((version) => version.id !== id)
    if (session.currentUserId) {
      persistence.write(versionsKey(session.currentUserId), versions.value)
    }
  }

  function byId(id: string): ResumeVersion | undefined {
    return versions.value.find((version) => version.id === id)
  }

  /**
   * 取一个版本的详情。
   *
   * **列表里不带「这一版是怎么来的」**——那条明细只在详情里。列表上的副本
   * 缺它时，按 id 去问服务端要一份；老版本本来就没有，问回来还是没有，
   * 界面显示「这一版生成时没有记录生成过程」。
   */
  async function ensureDetail(id: string): Promise<ResumeVersion | undefined> {
    const cached = byId(id)
    if (cached?.explain) return cached

    try {
      const result = await fetchVersion(id)
      versions.value = versions.value.map((version) =>
        version.id === result.version.id ? result.version : version,
      )
      return result.version
    } catch {
      // 问不到就用手上这份——离线时至少还能看
      return cached
    }
  }

  return { versions, count, restore, generate, remove, byId, ensureDetail }
})
