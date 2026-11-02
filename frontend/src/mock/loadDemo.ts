import { SAMPLE_DRAFT_TEXT, SAMPLE_JD_FRONTEND } from './fixtures'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

export interface DemoDataResult {
  draftSaved: boolean
  reason?: string
}

/** 一键复现样例简历与样例 JD，未登录时用演示身份进入。 */
export function loadDemoData(): DemoDataResult {
  const session = useSessionStore()
  // 始终用演示身份：示例简历落在演示用户的位置，不覆盖用户自己那份。
  // 这个身份不记住——它不是用户给自己起的名字，不该顶替「上次用过的名字」。
  session.login('演示用户', { remember: false })

  const draftStore = useDraftStore()
  draftStore.ingest(SAMPLE_DRAFT_TEXT)
  const outcome = draftStore.savePending({ confirmed: true })

  useUiStore().setDemoJd(SAMPLE_JD_FRONTEND)

  return { draftSaved: outcome.ok, reason: outcome.reason }
}
