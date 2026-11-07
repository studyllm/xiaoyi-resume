import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createIdSeed, resumeIdSeed, type IdSeed } from '@xiaoyi/shared/domain/ids'
import type { Draft, ResumeVersion } from '@xiaoyi/shared/domain/types'
import type { GenerateOptions } from '@xiaoyi/shared/engines/types'
import { useDraftStore } from './draft'
import { engineContext, useEngines } from './engines'
import { useSessionStore } from './session'
import { persistence, versionsKey } from './persistence'

export const useVersionStore = defineStore('versions', () => {
  const versions = ref<ResumeVersion[]>([])
  let seed: IdSeed = createIdSeed()

  const count = computed(() => versions.value.length)

  function restore(): void {
    const userId = useSessionStore().currentUserId
    const stored = userId ? persistence.read<ResumeVersion[]>(versionsKey(userId)) : null
    if (!stored) {
      // 当前用户没有版本：清掉内存里那一份，不留上一个用户的内容
      versions.value = []
      seed = createIdSeed()
      return
    }
    versions.value = stored
    seed = resumeIdSeed(stored.map((version) => version.id))
  }

  function generate(
    draft: Draft,
    jdText: string,
    options: GenerateOptions = {},
  ): ResumeVersion {
    if (!useSessionStore().isLoggedIn) {
      throw new Error('需要登录后才能生成版本')
    }

    const draftStore = useDraftStore()
    // 版本必须基于已保存的内容，修订号才对得上
    draftStore.saveIfDirty()
    const source = draftStore.draft ?? draft

    const engines = useEngines()
    const result = engines.generateVersion(
      source,
      jdText,
      engineContext(),
      { ...options, existingVersionCount: versions.value.length },
      seed,
    )

    const version = result.version
    versions.value = [...versions.value, version]
    const userId = useSessionStore().currentUserId
    if (userId) persistence.write(versionsKey(userId), versions.value)
    return version
  }

  function remove(id: string): void {
    versions.value = versions.value.filter((version) => version.id !== id)
    const userId = useSessionStore().currentUserId
    if (userId) persistence.write(versionsKey(userId), versions.value)
  }

  function byId(id: string): ResumeVersion | undefined {
    return versions.value.find((version) => version.id === id)
  }

  return { versions, count, restore, generate, remove, byId }
})
