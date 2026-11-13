/**
 * 候选要点的筛选。
 *
 * **裁剪只影响模型能看到什么，不影响系统能判定什么**——规则引擎始终看全部
 * 要点，这里挑出来的只是「发给模型的那一份」。
 *
 * **口径用 `jdRelated`**：它就是规则路径判断「这条要点与该岗位无关」用的
 * 那个信号（`ordering.ts` 的 `evidence.filter((entry) => entry.jdRelated)`）。
 * 用 `relevance > 0` 是不行的——`relevance` 里含「命中任何目录词」与
 * 「带结果信号」的加分，几乎每条要点都会大于 0，裁剪等于不裁。
 */
import type { BulletEvidence } from './coverage'

/** 候选条数的默认上限。服务端用环境变量覆盖。 */
export const DEFAULT_MAX_CANDIDATES = 40

export interface CandidateSelectionOptions {
  /** 最多发多少条要点给模型。 */
  maxCandidates?: number
}

/** 一个条目里留了哪一条、为什么留。 */
export interface ItemFloor {
  itemId: string
  bulletId: string
  /** 为什么留它。 */
  reason: string
}

/** 落选的要点与原因。 */
export interface DroppedBullet {
  bulletId: string
  reason: string
}

export interface CandidateSelection {
  /** 参与比对的要点，按简历里的先后排。 */
  candidates: BulletEvidence[]
  /** 每个条目至少留的那一条。 */
  floors: ItemFloor[]
  /** 落选的要点与原因。 */
  dropped: DroppedBullet[]
  /** 简历里的要点总数。 */
  totalBullets: number
}

/**
 * 挑出要发给模型的要点。
 *
 * **每个条目至少留一条**——整条项目对模型完全不可见时，模型连「这里有个
 * 项目做过什么」都不知道，关键词匹配也就无从复核。
 *
 * **上限是硬的**：条目数超过上限时，只能放弃一部分条目的名额——放弃哪几个
 * 按相关度取舍。条目数不超过上限时，每个条目都留得住。
 */
export function selectCandidates(
  evidence: BulletEvidence[],
  options: CandidateSelectionOptions = {},
): CandidateSelection {
  const maxCandidates = Math.max(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 0)
  const totalBullets = evidence.length

  const byItem = new Map<string, BulletEvidence[]>()
  for (const entry of evidence) {
    const group = byItem.get(entry.itemId)
    if (group) group.push(entry)
    else byItem.set(entry.itemId, [entry])
  }

  // 每个条目留一条：**只给那些否则一条都进不来的条目留**。
  // 条目内一条与岗位无关的都没有时，留相关度最高的——哪怕它其实无关。
  const floorByItem = new Map<string, BulletEvidence>()
  for (const [itemId, group] of byItem) {
    if (group.some((entry) => entry.jdRelated)) continue
    floorByItem.set(itemId, pickBest(group))
  }

  // 名额先给每个条目保底的那条，再按相关度补其余的。
  const floors = rank([...floorByItem.values()])
  const keptFloors = floors.slice(0, maxCandidates)
  const floorIds = new Set(keptFloors.map((entry) => entry.bulletId))
  const droppedFloors = floors.slice(maxCandidates)

  const relevant = rank(evidence.filter((entry) => entry.jdRelated && !floorIds.has(entry.bulletId)))
  const rest = relevant.slice(0, Math.max(maxCandidates - keptFloors.length, 0))

  const selected = [...keptFloors, ...rest]
  const chosen = new Set(selected.map((entry) => entry.bulletId))

  const dropped: DroppedBullet[] = []
  for (const entry of evidence) {
    if (chosen.has(entry.bulletId)) continue
    if (droppedFloors.some((floor) => floor.bulletId === entry.bulletId)) {
      dropped.push({
        bulletId: entry.bulletId,
        reason: '条目数超过候选上限，这个条目的名额让给了更相关的条目',
      })
      continue
    }
    dropped.push({
      bulletId: entry.bulletId,
      reason: entry.jdRelated
        ? '与该岗位相关，但候选条数达到上限'
        : '与该岗位无关，没有参与比对',
    })
  }

  return {
    // 按简历里的先后排——提示词里的编号因此是「跳过几个」的形状
    candidates: [...selected].sort((left, right) => left.draftIndex - right.draftIndex),
    floors: keptFloors.map((entry) => ({
      itemId: entry.itemId,
      bulletId: entry.bulletId,
      reason: '这个条目与该岗位无关，仍保留一条，让模型能看到这个条目做过什么',
    })),
    dropped,
    totalBullets,
  }
}

/** 相关度降序；相关度一样时按简历里的先后。 */
function rank(entries: BulletEvidence[]): BulletEvidence[] {
  return [...entries].sort((left, right) => {
    if (left.relevance !== right.relevance) return right.relevance - left.relevance
    return left.draftIndex - right.draftIndex
  })
}

/** 相关度最高的那条；一样时取简历里靠前的。 */
function pickBest(entries: BulletEvidence[]): BulletEvidence {
  return rank(entries)[0]!
}
