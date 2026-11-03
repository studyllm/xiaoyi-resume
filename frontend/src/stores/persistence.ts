import { EMPTY_PROFILE, type Draft, type ResumeVersion, type SectionKind } from '@/domain/types'

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const STORAGE_KEYS = {
  meta: 'xiaoyi.meta.v1',
  session: 'xiaoyi.session.v1',
  /** 上次用过的名字。退出登录也保留，身份框靠它预填。 */
  lastName: 'xiaoyi.lastName.v1',
  /** 旧版全局槽位：所有数据存在一处。现在只作迁移源，读完就拆走。 */
  legacyDraft: 'xiaoyi.draft.v2',
  legacyVersions: 'xiaoyi.versions.v2',
} as const

/** 简历按人分槽：key 里带用户标识，不同用户的数据互不可见。 */
export function draftKey(userId: string): string {
  return `xiaoyi.draft.v3:${userId}`
}

/** 版本按人分槽。 */
export function versionsKey(userId: string): string {
  return `xiaoyi.versions.v3:${userId}`
}

/** 每个当前 key 各自的老版本链。回溯只在本家族内进行，避免把别的 key 的数据写进来。 */
export const LEGACY_KEYS: Record<string, string[]> = {
  [STORAGE_KEYS.legacyDraft]: ['xiaoyi.draft.v1', 'xiaoyi.draft.v0'],
  [STORAGE_KEYS.legacyVersions]: ['xiaoyi.versions.v1', 'xiaoyi.versions.v0'],
}

export interface MigrationStep {
  version: number
  migrate(value: unknown): unknown
}

const SECTION_KINDS: SectionKind[] = ['education', 'experience', 'project', 'skills', 'other']

function toSectionKind(value: string | undefined): SectionKind {
  return SECTION_KINDS.includes(value as SectionKind) ? (value as SectionKind) : 'experience'
}

interface LegacyDraft {
  sections?: Array<{
    kind?: string
    title?: string
    items?: Array<{
      org?: string
      title?: string
      start?: string | null
      end?: string | null
      present?: boolean
      bullets?: string[]
    }>
  }>
}

function migrateDraftV0(raw: unknown): unknown {
  const legacy = raw as LegacyDraft
  if (!legacy || !Array.isArray(legacy.sections)) {
    throw new Error('旧版简历结构无法识别')
  }

  const sections = (legacy.sections ?? []).map((section, sectionIndex) => ({
    id: `section-${sectionIndex + 1}`,
    kind: toSectionKind(section.kind),
    title: section.title ?? '经历',
    items: (section.items ?? []).map((item, itemIndex) => ({
      id: `item-${sectionIndex + 1}-${itemIndex + 1}`,
      org: item.org,
      title: item.title,
      start: item.start ?? null,
      end: item.end ?? null,
      present: item.present ?? false,
      bullets: (item.bullets ?? []).map((text, bulletIndex) => ({
        id: `bullet-${sectionIndex + 1}-${itemIndex + 1}-${bulletIndex + 1}`,
        text,
      })),
    })),
  }))

  return {
    id: 'draft-1',
    userId: '',
    revision: 1,
    profile: { ...EMPTY_PROFILE },
    sections,
    updatedAt: '',
  } satisfies Draft
}

/** v1 → v2：版本新增抬头与要求覆盖，旧存档补空值 */
function migrateVersionsV1(raw: unknown): unknown {
  const legacy = raw as ResumeVersion[]
  if (!Array.isArray(legacy)) {
    throw new Error('旧版版本存档无法识别')
  }
  return legacy.map((version) => ({
    ...version,
    profile: version.profile ?? { ...EMPTY_PROFILE },
    coverage: version.coverage ?? [],
  }))
}

/** v1 → v2：底稿新增简历抬头，旧存档补一个空抬头 */
function migrateDraftV1(raw: unknown): unknown {
  const legacy = raw as Draft
  if (!legacy || !Array.isArray(legacy.sections)) {
    throw new Error('旧版简历结构无法识别')
  }
  return { ...legacy, profile: legacy.profile ?? { ...EMPTY_PROFILE } }
}

export const MIGRATIONS: Record<string, MigrationStep[]> = {
  'xiaoyi.draft.v0': [
    { version: 1, migrate: migrateDraftV0 },
    { version: 2, migrate: migrateDraftV1 },
  ],
  'xiaoyi.draft.v1': [{ version: 2, migrate: migrateDraftV1 }],
  'xiaoyi.versions.v1': [{ version: 2, migrate: migrateVersionsV1 }],
  'xiaoyi.versions.v0': [{ version: 2, migrate: migrateVersionsV1 }],
}

interface StoredSlice<T> {
  v: number
  data: T
}

export interface Persistence {
  persistent: boolean
  read<T>(key: string): T | null
  write<T>(key: string, value: T): void
  remove(key: string): void
  takeWarnings(): string[]
}

function createMemoryAdapter(): StorageAdapter {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function detectAdapter(): { adapter: StorageAdapter; persistent: boolean } {
  try {
    const probe = '__xiaoyi_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return { adapter: window.localStorage, persistent: true }
  } catch {
    return { adapter: createMemoryAdapter(), persistent: false }
  }
}

export function createPersistence(
  adapter?: StorageAdapter,
  persistent = true,
): Persistence {
  const storage = adapter ?? createMemoryAdapter()
  const warnings: string[] = []

  const write = <T>(key: string, value: T): void => {
    const payload: StoredSlice<T> = { v: 1, data: value }
    try {
      storage.setItem(key, JSON.stringify(payload))
    } catch {
      warnings.push('本地存储写入失败，本次修改不会被保存')
    }
  }

  const remove = (key: string): void => {
    try {
      storage.removeItem(key)
    } catch {
      warnings.push('本地存储清理失败')
    }
  }

  const read = <T>(key: string): T | null => {
    const raw = storage.getItem(key)
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as StoredSlice<T>
        if (parsed && typeof parsed === 'object' && 'data' in parsed) return parsed.data
      } catch {
        remove(key)
        warnings.push('本地存档格式无法读取，已重置这一部分数据')
        return null
      }
    }

    for (const legacyKey of [...(LEGACY_KEYS[key] ?? [])].reverse()) {
      const legacyRaw = storage.getItem(legacyKey)
      if (legacyRaw === null) continue

      const steps = MIGRATIONS[legacyKey]
      if (!steps) continue

      try {
        const parsed = JSON.parse(legacyRaw) as { data?: unknown }
        let value: unknown = parsed.data
        for (const step of steps ?? []) {
          value = step.migrate(value)
        }
        write(key, value as T)
        remove(legacyKey)
        return value as T
      } catch {
        remove(legacyKey)
        warnings.push('旧版存档升级失败，这部分数据已丢弃')
        return null
      }
    }

    return null
  }

  return {
    persistent,
    read,
    write,
    remove,
    takeWarnings: () => warnings.splice(0, warnings.length),
  }
}

const detected = detectAdapter()

export const persistence: Persistence = createPersistence(detected.adapter, detected.persistent)

/**
 * 旧存档里所有数据存在一处，现在按用户标识拆到各自分槽。
 *
 * 简历全局只有一份，只能归给记录里的那个用户；版本是累积的，可能混着多个人，
 * 按标识分组各归各家。拆完把旧的全局 key 删掉。
 */
export function splitLegacySlots(store: Persistence = persistence): void {
  const legacyDraft = store.read<{ userId?: string }>(STORAGE_KEYS.legacyDraft)
  if (legacyDraft?.userId) {
    store.write(draftKey(legacyDraft.userId), legacyDraft)
    store.remove(STORAGE_KEYS.legacyDraft)
  }

  const legacyVersions = store.read<{ userId?: string }[]>(STORAGE_KEYS.legacyVersions)
  if (legacyVersions?.length) {
    const groups = new Map<string, { userId?: string }[]>()
    for (const version of legacyVersions) {
      const userId = version.userId ?? ''
      const group = groups.get(userId)
      if (group) group.push(version)
      else groups.set(userId, [version])
    }
    for (const [userId, list] of groups) {
      const key = versionsKey(userId)
      const existing = store.read<{ userId?: string }[]>(key) ?? []
      store.write(key, [...existing, ...list])
    }
    store.remove(STORAGE_KEYS.legacyVersions)
  }
}

/** 上次用过的名字。退出登录也保留，身份框靠它预填。 */
export function readLastName(): string {
  return persistence.read<string>(STORAGE_KEYS.lastName) ?? ''
}

export function writeLastName(name: string): void {
  persistence.write(STORAGE_KEYS.lastName, name)
}
