/**
 * 全局与段统一融合（spec §5.4，G1）：纯逻辑回归 + ≥2 证据线护栏。
 * 段分 = 同一 fuseEvidence 施加于段特征 → 全局/段严格同口径（G14 依赖此一致性）。
 * 档案（权重/分位表/ppl track）全部由调用方传入，本模块零 DB/零 LLM。
 */
import type { Genre } from '../../common/novel/novel-detect-calib.js'
import {
  FUSION_FEATURE_KEYS, VERDICT_AI_THRESHOLD, VERDICT_MIXED_THRESHOLD,
  SHORT_TEXT_CHARS, isCriticalBand,
} from '../../common/novel/novel-detect-calib.js'
import { statLine, STRONG_LINE_THRESHOLD } from './ai-evidence-rules.js'
import {
  PERCENTILE_KEYS, zFeature, directionOf, pplLineScore,
  type PercentileTable, type StatSub,
} from './ai-detect-calibration.js'
import type { RawFeatures } from './ai-detect-features.js'

/** engine 用 calib.pplTrack + pplToZ 预计算 z 传入（多窗聚合后的代表窗） */
export type RefLineInput = {
  mode: 'echo' | 'prompt_logprobs' | 'proxy'
  model: string
  z: number | null
  calibrated: boolean
  /** 展示字段（不参与计算） */
  ppl?: number
  meanLogprob?: number
  tokens?: number
}
export type FusionWeights = { w: number[]; b: number }
export type FusionInput = {
  raws: RawFeatures
  genre: Genre
  table: PercentileTable
  weights: FusionWeights
  ref?: RefLineInput | null
  sameFamily: boolean
  fpSim?: number | null
  perturbStab?: number | null
  statsSub?: StatSub
}
export type EvidenceLine = {
  key: 'S1_statistical' | 'S2_reference' | 'S3_fingerprint' | 'S4_model_family' | 'S5_adversarial'
  label: string
  score: number | null
  missing?: boolean
  note?: string
}
export type FusionResult = {
  probability: number
  verdict: 'likely_human' | 'mixed' | 'likely_ai'
  confidence: 'low' | 'medium' | 'high'
  needsReview: boolean
  uncalibrated: boolean
  s1: number; s2: number | null; s3: number | null; s5: number | null
  dimHighCount: number
  featureVector: number[]
  evidenceLines: EvidenceLine[]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const r3 = (v: number) => Math.round(clamp01(v) * 1000) / 1000

/** 处于 AI 方向高分位（z≥1，约 84+ 百分位）的特征维数 */
export function highDimCount(raws: RawFeatures, table: PercentileTable): number {
  let n = 0
  for (const key of PERCENTILE_KEYS) {
    if (!table[key]?.length) continue
    const value = (raws as unknown as Record<string, number>)[key]
    if (!Number.isFinite(value)) continue
    const z = zFeature(key, value, table)
    const signed = directionOf(key) === 'low_ai' ? -z : z
    if (signed >= 1) n++
  }
  return n
}

export function fuseEvidence(input: FusionInput): FusionResult {
  const s1 = r3(statLine(input.raws, input.table, input.statsSub))
  let s2: number | null = null
  let s2Note: string | undefined
  if (input.ref && input.ref.calibrated && input.ref.z != null) {
    const line = pplLineScore(input.ref.z, 1.0)
    if (line != null) {
      const attenuated = (input.ref.mode === 'proxy' ? line * 0.5 : line) * (input.sameFamily ? 0.6 : 1)
      s2 = r3(attenuated)
      s2Note = input.ref.mode === 'proxy'
        ? 'chat 续写代理指标（弱证据，权重减半）'
        : input.sameFamily ? '写作与参考模型同系，S2 衰减' : '真文内困惑度'
    }
  } else if (input.ref) {
    s2Note = '参考模型无校准档案（ppl_tracks 缺失），S2 不计分'
  }
  const s3 = input.fpSim == null ? null : r3(input.fpSim)
  const s5 = input.perturbStab == null ? null : r3(input.perturbStab)
  const dimHigh = highDimCount(input.raws, input.table)

  const x: number[] = [
    s1,
    s2 ?? 0,
    input.ref?.calibrated && input.ref.z != null ? Math.max(0, -input.ref.z) / 3 : 0, // ppl 低于基线越多越 AI
    s3 ?? 0,
    s5 ?? 0,
    input.sameFamily ? 1 : 0,
    Math.log10(Math.max(10, input.raws.char_count)) / 5,
    s2 == null ? 1 : 0,
    s3 == null ? 1 : 0,
    s5 == null ? 1 : 0,
  ]
  if (x.length !== FUSION_FEATURE_KEYS.length) throw new Error(`fusion dim mismatch ${x.length}`)
  const logit = input.weights.b + x.reduce((acc, v, i) => acc + v * (input.weights.w[i] ?? 0), 0)
  let probability = Math.max(2, Math.min(98, Math.round(100 / (1 + Math.exp(-logit)))))

  // ≥2 证据线护栏（spec §5.4）：official/academic 双强线，其余“S2≥0.6 或 ≥2 维高分位”
  if (probability >= VERDICT_AI_THRESHOLD) {
    const strongLines = [s2, s3, s5].filter((v): v is number => v != null && v >= STRONG_LINE_THRESHOLD).length
    const twoLineRequired = input.genre === 'official' || input.genre === 'academic'
    const corroborated = twoLineRequired
      ? (strongLines >= 2 || ((s2 ?? 0) >= STRONG_LINE_THRESHOLD && dimHigh >= 2))
      : ((s2 ?? 0) >= STRONG_LINE_THRESHOLD || dimHigh >= 2)
    if (!corroborated) probability = VERDICT_AI_THRESHOLD - 1
  }

  const verdict = probability >= VERDICT_AI_THRESHOLD ? 'likely_ai'
    : probability >= VERDICT_MIXED_THRESHOLD ? 'mixed' : 'likely_human'
  const charCount = input.raws.char_count
  let confidence: FusionResult['confidence'] = charCount < SHORT_TEXT_CHARS ? 'low'
    : charCount < 800 ? 'medium' : 'high'
  if (s2 == null && confidence === 'high') confidence = 'medium'
  const needsReview = isCriticalBand(probability) || s2 == null

  const evidenceLines: EvidenceLine[] = [
    { key: 'S1_statistical', label: '统计特征（节奏/词汇/标点/模板）', score: s1 },
    s2 == null
      ? { key: 'S2_reference', label: '参考模型困惑度', score: null, missing: true, note: s2Note || '参考模型不可用' }
      : { key: 'S2_reference', label: '参考模型困惑度', score: s2, note: s2Note },
    s3 == null
      ? { key: 'S3_fingerprint', label: '站内输出指纹对照', score: null, missing: true, note: '站内指纹库未建或未命中' }
      : { key: 'S3_fingerprint', label: '站内输出指纹对照', score: s3 },
    { key: 'S4_model_family', label: '写作/参考模型系别', score: input.sameFamily ? 0.6 : 0, note: input.sameFamily ? '同系检测偏差风险' : '异系参考' },
    s5 == null
      ? { key: 'S5_adversarial', label: '对抗扰动稳定性', score: null, missing: true, note: '非临界样本或扰动关闭' }
      : { key: 'S5_adversarial', label: '对抗扰动稳定性', score: s5 },
  ]
  return { probability, verdict, confidence, needsReview, uncalibrated: !(input.ref?.calibrated ?? false),
    s1, s2, s3, s5, dimHighCount: dimHigh, featureVector: x, evidenceLines }
}

/** 段分数 [0,1]（aigc），probability 0–100 整数同源换算 */
export function segmentAigc(f: FusionResult): number {
  return Math.round(f.probability) / 100
}
