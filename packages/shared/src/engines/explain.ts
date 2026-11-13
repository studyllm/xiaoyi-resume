/**
 * 「这一版是怎么来的」的数据组装。
 *
 * **纯函数**——从覆盖清单、要点证据、改动对照与声明记录里算出面板要的东西。
 * 面板上的每条事实都能追溯到其中一条，**不依赖「这次是不是降级」那个标志**
 * ——那个标志的语义有歧义，面板不能建在它上面。
 */
import type {
  Claim,
  ExplainBullet,
  ExplainModelCall,
  ExplainRewrite,
  IntegrityViolation,
  RequirementCoverage,
  ResumeVersion,
  VersionExplain,
} from '../domain/types'

export interface ExplainInput {
  version: ResumeVersion
  /** 逐条分档。 */
  coverage: RequirementCoverage[]
  /**
   * 候选筛选的结果。
   *
   * **null 表示这次没有筛选过**——规则路径看的是全部要点。
   */
  selection: {
    comparedBulletIds: string[]
    dropped: { bulletId: string; reason: string }[]
  } | null
  /** 这次参与比对的要点条数与简历里的要点总数。 */
  scope: { comparedBullets: number; totalBullets: number }
  /** 两次模型调用的记录。 */
  calls: ExplainModelCall[]
}

/** 组装面板数据。 */
export function buildExplain(input: ExplainInput): VersionExplain {
  const { version, coverage, selection, scope, calls } = input

  const requirementsByBullet = mapRequirementsByBullet(coverage)
  const droppedById = new Map((selection?.dropped ?? []).map((entry) => [entry.bulletId, entry.reason]))
  const compared = new Set(selection?.comparedBulletIds ?? [])

  const bullets: ExplainBullet[] = version.diff.map((entry) => {
    const droppedReason = droppedById.get(entry.bulletId)
    return {
      bulletId: entry.bulletId,
      sectionKind: entry.sectionKind,
      sectionTitle: entry.sectionTitle,
      itemLabel: entry.itemLabel,
      outcome: entry.change,
      reason: droppedReason ? `${entry.reason}；${droppedReason}` : entry.reason,
      // 没筛选过时，全部要点都算参与过比对
      compared: selection ? compared.has(entry.bulletId) : true,
      matchedRequirements: requirementsByBullet.get(entry.bulletId) ?? [],
      writtenBy: entry.writtenBy ?? 'rules',
    }
  })

  const rewrites = mergeRewriteExplain({
    version,
    claims: version.trace?.claims ?? [],
    violations: version.integrity.violations,
  })

  return {
    pipeline: {
      requirementCount: coverage.length,
      totalBullets: scope.totalBullets,
      comparedBullets: scope.comparedBullets,
      keptBullets: version.diff.filter((entry) => entry.change !== 'remove').length,
      modelRewritten: version.diff.filter((entry) => entry.writtenBy === 'model').length,
      reverted: version.integrity.reverted ?? 0,
      checked: version.integrity.checked,
    },
    bullets,
    rewrites,
    model: { calls },
  }
}

/**
 * 模型改写与换回的逐条记录。
 *
 * **只认模型写的那些**——规则引擎自己的校验异常不算模型的改写。
 */
export function mergeRewriteExplain(input: {
  version: ResumeVersion
  claims: Claim[]
  violations: IntegrityViolation[]
}): ExplainRewrite[] {
  const { version, claims, violations } = input
  const violationByClaimId = new Map(violations.map((entry) => [entry.claimId, entry]))
  const finalTextByBullet = new Map<string, string>()
  for (const section of version.sections) {
    for (const item of section.items) {
      for (const bullet of item.bullets) finalTextByBullet.set(bullet.id, bullet.text)
    }
  }

  return claims.map((claim) => {
    const violation = violationByClaimId.get(claim.claimId)
    return {
      bulletId: claim.bulletId,
      modelText: claim.text,
      finalText: violation?.revertedText ?? finalTextByBullet.get(claim.bulletId) ?? claim.text,
      rejectedKind: violation?.kind ?? null,
      rejectedReason: violation?.reason ?? null,
    }
  })
}

/** 要点 id → 命中它的要求原文。 */
function mapRequirementsByBullet(coverage: RequirementCoverage[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const entry of coverage) {
    if (entry.tier === 'none') continue
    for (const bulletId of entry.matchedBulletIds) {
      const list = map.get(bulletId)
      if (list) list.push(entry.text)
      else map.set(bulletId, [entry.text])
    }
  }
  return map
}
