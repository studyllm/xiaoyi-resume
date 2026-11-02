import { mockEngines } from '@/engines/mockEngines'
import type { EngineContext, ResumeEngines } from '@/engines/types'

const ENGINE_VERSION = 'mock-0.1.0'

const ENGINES: Record<string, ResumeEngines> = {
  mock: mockEngines,
}

export function useEngines(): ResumeEngines {
  const mode = import.meta.env.VITE_ENGINE_MODE ?? 'mock'
  return ENGINES[mode] ?? mockEngines
}

export function engineContext(): EngineContext {
  return { now: new Date().toISOString(), engineVersion: ENGINE_VERSION }
}
