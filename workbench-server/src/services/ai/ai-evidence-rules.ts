// src/services/ai/ai-evidence-rules.ts
/** 确定性回退规则（spec §3/§5.4/§11）：无档案/档案损坏时的默认权重与门槛。 */
import type { Genre } from '../../common/novel/novel-detect-calib.js'
import {
  DEFAULT_PERCENTILE_TABLES, lineScoreFromPercentiles, FEATURE_DIRECTIONS,
  zFeature, directionOf, PERCENTILE_KEYS,
  type PercentileKey, type PercentileTable, type StatSub,
} from './ai-detect-calibration.js'
import { VERDICT_AI_THRESHOLD, VERDICT_MIXED_THRESHOLD } from '../../common/novel/novel-detect-calib.js'
import type { RawFeatures } from './ai-detect-features.js'

/** 证据线「强证据」门槛（≥2 线护栏与扰动稳定性分共用，spec §5.4） */
export const STRONG_LINE_THRESHOLD = 0.6

/** 统计证据线 S1：方向修正的分位加权线。词表类特征（tells_density）封顶 0.08 权重（spec §5.1） */
const STAT_WEIGHTS: Record<PercentileKey, number> = {
  sentence_len_cv: 0.16, para_len_cv: 0.08, char_ttr: 0.1, char_entropy: 0.08,
  bigram_repeat: 0.12, trigram_repeat: 0.1, punct_density: 0.06, dash_density: 0.04,
  quote_density: 0.04, opening_pattern_entropy: 0.08, syntactic_template_index: 0.12,
  dialogue_len_cv: 0.06, tag_variety: 0.04, tells_density: 0.08, colloquial_density: 0.06,
}
export function statLine(
  raws: RawFeatures,
  table: PercentileTable = DEFAULT_PERCENTILE_TABLES.web_fiction,
  sub?: StatSub,
): number {
  if (sub && sub.w.length === PERCENTILE_KEYS.length) {
    let acc = sub.b
    for (let i = 0; i < PERCENTILE_KEYS.length; i++) {
      const k = PERCENTILE_KEYS[i]!
      const z = zFeature(k, (raws as unknown as Record<string, number>)[k] ?? 0, table)
      const p = 1 / (1 + Math.exp(-(directionOf(k) === 'low_ai' ? -z : z)))
      acc += p * (sub.w[i] ?? 0)
    }
    const s = 1 / (1 + Math.exp(-acc))
    return Math.max(0.01, Math.min(0.99, s))
  }
  return lineScoreFromPercentiles(raws, FEATURE_DIRECTIONS, STAT_WEIGHTS, table)
}

/** 冷启动融合 seed 权重（FUSION_FEATURE_KEYS 顺序；训练档案就绪前的默认值） */
export function seedFusionWeights(_genre: Genre): { w: number[]; b: number } {
  return {
    //    s1    s2line s2z+   fp    s5     samefam log_len miss_s2 miss_fp miss_s5
    w: [2.0, 1.30, 0.55, 0.55, 0.95, 0.35, 0.05, -0.85, 0.10, 0.15],
    b: -2.15,
  }
}

export function decisionFromProbability(prob: number): 'likely_human' | 'mixed' | 'likely_ai' {
  return prob >= VERDICT_AI_THRESHOLD ? 'likely_ai'
    : prob >= VERDICT_MIXED_THRESHOLD ? 'mixed' : 'likely_human'
}
