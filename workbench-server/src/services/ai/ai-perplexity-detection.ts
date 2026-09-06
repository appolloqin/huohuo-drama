/**
 * 兼容壳：新逻辑在 ai-detect-engine；本文件仅保住历史 export。
 * detectAiTextWithPerplexity → runAiDetect；失败由 engine 内部降级（不再抛到 hub catch）。
 * detectAiTextStatisticalFallback → 强制 referenceScorer 抛错的 runAiDetect（engine 内部兜底）
 */
import type { TextBillingContext } from './ai.js'
import type { AiDetectionResult } from './ai-text-detection.js'
import { runAiDetect } from './ai-detect-engine.js'

export const AI_PERPLEXITY_METHOD = 'perplexity_v1' as const
export const AI_STATISTICAL_FALLBACK_METHOD = 'statistical_v1_fallback' as const

/** @deprecated 保留导出供旧调用；多窗逻辑已取代单头 3k */
export const MAX_SAMPLE_CHARS = 3000

/** 将困惑度映射为 AI 生成概率（模型相关，启发式校准） */
export function perplexityToAiProbability(perplexity: number): number {
  if (!Number.isFinite(perplexity) || perplexity <= 0) return 50
  const score = 100 / (1 + Math.exp((perplexity - 18) / 4))
  return Math.round(Math.min(97, Math.max(4, score)))
}

/** @deprecated 转 runAiDetect；签名保留兼容 */
export async function detectAiTextWithPerplexity(
  text: string,
  billing?: TextBillingContext,
  opts?: {
    genre?: string
    enableAdversarial?: boolean
    writingModelHint?: string
    sourceTypeHint?: string
    budgetTier?: 'short' | 'standard' | 'long'
    skipCacheStore?: boolean
  },
): Promise<AiDetectionResult> {
  return runAiDetect(text, { billing, ...opts })
}

/** S2 不可用：engine 内部已融合统计线（method=statistical_v2）；保留名字兼容旧 catch */
export async function detectAiTextStatisticalFallback(
  text: string,
  fallbackReason: string,
  opts?: { genre?: string; enableAdversarial?: boolean },
): Promise<AiDetectionResult> {
  const r = await runAiDetect(text, {
    genre: opts?.genre,
    referenceScorer: async () => { throw new Error(fallbackReason) },
    enableAdversarial: false,
    skipCacheStore: true,
  })
  return {
    ...r,
    method: 'statistical_v2',
    fallback_reason: r.fallback_reason
      ? `${fallbackReason}（${r.fallback_reason}）`
      : fallbackReason,
  }
}
