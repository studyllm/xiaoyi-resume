import { SAMPLE_DRAFT_TEXT, SAMPLE_JD_FRONTEND } from './fixtures'
import type { ActiveState } from '@xiaoyi/shared/domain/states'
import { useDraftStore } from '@/stores/draft'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

export interface DemoDataResult {
  draftSaved: boolean
  /** 没存成时的状态：文案与用户能做的下一步都在状态表里。 */
  failure?: ActiveState
}

/**
 * 一键复现样例简历与样例 JD。
 *
 * 先在服务端建一个临时账号——演示数据也要落在某个账号下，否则用户看不到
 * 「自己的简历」是什么样子。账号是临时的，垃圾数据由定时任务清掉。
 */
export async function loadDemoData(): Promise<DemoDataResult> {
  const session = useSessionStore()
  await session.loginAsDemo()

  const draftStore = useDraftStore()
  await draftStore.ingest(SAMPLE_DRAFT_TEXT)
  const outcome = await draftStore.savePending({ confirmed: true })

  useUiStore().setDemoJd(SAMPLE_JD_FRONTEND)

  return { draftSaved: outcome.ok, failure: outcome.failure }
}
