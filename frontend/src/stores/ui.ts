import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { tierFor, type ViewportTier } from '@xiaoyi/shared/domain/breakpoints'

export type UnsavedChoice = 'save' | 'discard' | 'stay'

export const useUiStore = defineStore('ui', () => {
  const ignoredIssueKeys = ref<string[]>([])
  const demoJdText = ref<string | null>(null)

  const activeCommentId = ref<string | null>(null)
  const handledCommentIds = ref<string[]>([])
  const commentSidebarCollapsed = ref(false)
  const sidebarAutoCollapsed = ref(false)
  const focusCommentId = ref<string | null>(null)
  const scrollToSection = ref<string | null>(null)
  const pendingEditRequest = ref<string | null>(null)
  /** 离开页面时的未保存修改选择。 */
  const unsavedChoicePending = ref(false)

  /** 视口宽度。断点判定只有这一处。 */
  const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
  const viewportTier = computed<ViewportTier>(() => tierFor(viewportWidth.value))
  let unsavedResolver: ((choice: UnsavedChoice) => void) | null = null

  /** 离开前问清楚：保存并离开、放弃修改并离开、还是留在本页。 */
  function requestUnsavedChoice(): Promise<UnsavedChoice> {
    unsavedChoicePending.value = true
    return new Promise((resolve) => {
      unsavedResolver = resolve
    })
  }

  function resolveUnsavedChoice(choice: UnsavedChoice): void {
    const resolve = unsavedResolver
    unsavedResolver = null
    unsavedChoicePending.value = false
    resolve?.(choice)
  }

  /** 按意见自己的标识记被忽略的批注。同一条规则的不同意见要能各忽略各的。 */
  function ignoreIssue(issueId: string): void {
    if (!ignoredIssueKeys.value.includes(issueId)) {
      ignoredIssueKeys.value = [...ignoredIssueKeys.value, issueId]
    }
  }

  function isIssueIgnored(issueId: string): boolean {
    return ignoredIssueKeys.value.includes(issueId)
  }

  function setViewportWidth(width: number): void {
    viewportWidth.value = width
  }

  function setDemoJd(text: string | null): void {
    demoJdText.value = text
  }

  function selectComment(id: string | null): void {
    activeCommentId.value = id
  }

  function markHandled(id: string): void {
    if (!handledCommentIds.value.includes(id)) {
      handledCommentIds.value = [...handledCommentIds.value, id]
    }
  }

  function unmarkHandled(id: string): void {
    handledCommentIds.value = handledCommentIds.value.filter((entry) => entry !== id)
  }

  function isHandled(id: string): boolean {
    return handledCommentIds.value.includes(id)
  }

  function toggleSidebar(): void {
    sidebarAutoCollapsed.value = false
    commentSidebarCollapsed.value = !commentSidebarCollapsed.value
  }

  function setSidebarCollapsed(collapsed: boolean): void {
    commentSidebarCollapsed.value = collapsed
  }

  /** 自动折叠：没有批注时收起来，批注到了再展开。手动切换后不再自动干预。 */
  function autoCollapseSidebar(collapsed: boolean): void {
    if (collapsed) {
      sidebarAutoCollapsed.value = true
      commentSidebarCollapsed.value = true
      return
    }
    if (!sidebarAutoCollapsed.value) return
    sidebarAutoCollapsed.value = false
    commentSidebarCollapsed.value = false
  }

  /** 从批注跳到编辑页时，聚焦对应批注。 */
  function focusComment(issueId: string): void {
    focusCommentId.value = issueId
  }

  function requestScrollToSection(sectionId: string): void {
    scrollToSection.value = sectionId
  }

  function clearScrollToSection(): void {
    scrollToSection.value = null
  }

  /** 请求以编辑模式进入简历页；一次性，读取后即失效。 */
  function requestEditMode(issueId: string | null = null): void {
    pendingEditRequest.value = issueId
  }

  function consumeEditRequest(): string | null {
    const request = pendingEditRequest.value
    pendingEditRequest.value = null
    return request
  }

  /** 清掉全部与诊断意见相关的标记。诊断结果被清空时跟着一起清。 */
  function clearIssueMarks(): void {
    ignoredIssueKeys.value = []
    handledCommentIds.value = []
    activeCommentId.value = null
    focusCommentId.value = null
  }

  return {
    ignoredIssueKeys,
    demoJdText,
    activeCommentId,
    handledCommentIds,
    commentSidebarCollapsed,
    sidebarAutoCollapsed,
    focusCommentId,
    scrollToSection,
    pendingEditRequest,
    unsavedChoicePending,
    viewportWidth,
    viewportTier,
    ignoreIssue,
    isIssueIgnored,
    setViewportWidth,
    setDemoJd,
    selectComment,
    markHandled,
    unmarkHandled,
    isHandled,
    toggleSidebar,
    setSidebarCollapsed,
    autoCollapseSidebar,
    focusComment,
    requestScrollToSection,
    clearScrollToSection,
    requestEditMode,
    consumeEditRequest,
    requestUnsavedChoice,
    resolveUnsavedChoice,
    clearIssueMarks,
  }
})
