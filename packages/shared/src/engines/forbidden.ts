export const FORBIDDEN_WORDS: string[] = [
  '面试',
  '笔试',
  '八股',
  '考点',
  '题库',
  '题目',
  '刷题',
  '真题',
  '面经',
]

export function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter((word) => text.includes(word))
}

export function isCleanOutput(text: string): boolean {
  return findForbiddenWords(text).length === 0
}

export function assertCleanOutput(text: string, context?: string): void {
  const hits = findForbiddenWords(text)
  if (hits.length === 0) return
  const where = context ? `（${context}）` : ''
  throw new Error(`输出包含禁用词${where}：${hits.join('、')}`)
}

export function maskForbiddenWords(text: string): string {
  let masked = text
  for (const word of FORBIDDEN_WORDS) {
    masked = masked.split(word).join('**')
  }
  return masked
}
