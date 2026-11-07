import { diagnose } from './diagnose'
import { generateVersion, evaluateJd } from './generateVersion'
import { parseJd } from './jd'
import { parseDraft } from './parseDraft'
import type { ResumeEngines } from './types'

export const mockEngines: ResumeEngines = {
  parseDraft,
  diagnose,
  parseJd,
  evaluateJd,
  generateVersion,
}
