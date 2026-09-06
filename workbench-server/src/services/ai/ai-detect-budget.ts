/** 检测预算与缓存键（spec §5.7，G11） */
import { REF_CALL_BUDGET_CAP } from '../../common/novel/novel-detect-calib.js'
import type { AiDetectRunCacheKey } from '../../db/repos/types.js'
import type { RefScore } from './ai-detect-reference.js'

export type BudgetTier = 'short' | 'standard' | 'long'
export type BudgetSpec = {
  windowChars: number
  maxWindows: number
  /** 参考候选模型数；0=短文本不启用困惑度 */
  maxCandidates: number
  /** 段级 PPL 复检 topK */
  segTopK: number
  /** 本次检测 S2 调用上限（含段级/扰动，不含能力探测） */
  refCallBudget: number
  allowPerturb: boolean
}
const SPECS: Record<BudgetTier, BudgetSpec> = {
  short:    { windowChars: 1200, maxWindows: 1, maxCandidates: 0, segTopK: 0, refCallBudget: 0, allowPerturb: false },
  standard: { windowChars: 2000, maxWindows: 3, maxCandidates: 3, segTopK: 3, refCallBudget: 6, allowPerturb: true },
  long:     { windowChars: 2000, maxWindows: 4, maxCandidates: 3, segTopK: 2, refCallBudget: REF_CALL_BUDGET_CAP, allowPerturb: true },
}
export function pickBudgetTier(charCount: number): BudgetTier {
  if (charCount < 2000) return 'short'
  if (charCount <= 50_000) return 'standard'
  return 'long'
}
export function resolveBudget(tier: BudgetTier): BudgetSpec { return { ...SPECS[tier] } }

/** scoreWithReference 注入面：默认实现走 ai.js 配置（Task 3.1 导出），engine 测试可 mock */
export type ReferenceScorer = (text: string, opts?: { billing?: unknown; maxCandidates?: number }) => Promise<RefScore>

/** 四元组缓存键（spec §6.1；variant=tier|refKey|adv|prof）。engineVersion 已含 feature 版本 */
export function cacheKeyFor(input: {
  contentHash: string
  genre: string
  engineVersion: string
  tier: BudgetTier
  /** 生效配置摘要：首个可用候选模型名（未配置='none'） */
  refKey: string
  perturbed: boolean
  profileVersion: number | null
}): AiDetectRunCacheKey {
  return {
    contentHash: input.contentHash,
    genre: input.genre,
    engineVersion: input.engineVersion,
    cacheVariant: `t=${input.tier},v=${input.refKey},adv=${input.perturbed ? 1 : 0},prof=${input.profileVersion ?? 0}`,
  }
}
