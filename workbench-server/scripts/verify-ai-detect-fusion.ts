// scripts/verify-ai-detect-fusion.ts
import { fuseEvidence, highDimCount, type RefLineInput } from '../src/services/ai/ai-detect-fusion.js'
import { DEFAULT_PERCENTILE_TABLES } from '../src/services/ai/ai-detect-calibration.js'
import { seedFusionWeights } from '../src/services/ai/ai-evidence-rules.js'

const HUMAN = {
  char_count: 2200, sentence_len_cv: 0.72, para_len_cv: 0.8, char_ttr: 0.5, char_entropy: 9.6,
  bigram_repeat: 0.08, trigram_repeat: 0.04, punct_density: 0.12, dash_density: 0.002, quote_density: 0.02,
  opening_pattern_entropy: 5.5, syntactic_template_index: 0.1, dialogue_len_cv: 0.75, tag_variety: 0.9,
  tells_density: 0.001, colloquial_density: 0.014,
}
const ROBOT = {
  char_count: 2400, sentence_len_cv: 0.18, para_len_cv: 0.2, char_ttr: 0.32, char_entropy: 8.4,
  bigram_repeat: 0.3, trigram_repeat: 0.16, punct_density: 0.03, dash_density: 0.01, quote_density: 0,
  opening_pattern_entropy: 3.0, syntactic_template_index: 0.5, dialogue_len_cv: 0.25, tag_variety: 0.3,
  tells_density: 0.012, colloquial_density: 0.0005,
}
const table = DEFAULT_PERCENTILE_TABLES.web_fiction
const weights = seedFusionWeights('web_fiction')
const refEcho: RefLineInput = { mode: 'echo', model: 'qwen-plus@1', z: -2.0, calibrated: true }

const h = fuseEvidence({ raws: HUMAN as never, genre: 'web_fiction', table, weights, ref: null, sameFamily: false })
const r = fuseEvidence({ raws: ROBOT as never, genre: 'web_fiction', table, weights, ref: refEcho, sameFamily: false })
if (!(h.probability < 40 && h.verdict === 'likely_human')) throw new Error('human should be low')
if (!(r.probability >= 65)) throw new Error(`robot with strong S2+multi-dim should be high, got ${r.probability}`)
if (!r.evidenceLines.find((e) => e.key === 'S2_reference' && e.score != null)) throw new Error('S2 line missing')
if (h.needsReview && h.s2 != null) throw new Error('needsReview should track S2/临界')

// 护栏：S2 缺失且高分位维数 <2 时纯统计不得判 likely_ai（即使人为抬权把原始概率推高）
const ONE_DIM = { ...HUMAN, dash_density: 0.9 }  // 仅 dash_density 一维落 AI 高分位
const inflated = { w: [8, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: -1 }
const capped = fuseEvidence({ raws: ONE_DIM as never, genre: 'web_fiction', table, weights: inflated, ref: null, sameFamily: false })
if (capped.probability > 64) throw new Error(`guardrail failed: ${capped.probability}`)
// 缺失指示与降置信
if (capped.confidence === 'high') throw new Error('missing S2 must not be high confidence')
if (!capped.evidenceLines.find((e) => e.key === 'S1_statistical' && !e.missing)) throw new Error('S1 evidence absent')

// 同系 ×0.6 衰减可观测
const fam = fuseEvidence({ raws: ROBOT as never, genre: 'web_fiction', table, weights, ref: refEcho, sameFamily: true })
if (!(fam.s2 != null && r.s2 != null && fam.s2 < r.s2)) throw new Error('same-family damping')

// official 需双强线：S2 强但 dimHigh 低（人写特征）也压不住 → 单线封顶
const officialSingle = fuseEvidence({ raws: HUMAN as never, genre: 'official', table: DEFAULT_PERCENTILE_TABLES.official, weights: { w: [2, 1.3, 0.5, 0, 1, 0, 0, 0, 0, 0], b: 1.5 }, ref: { ...refEcho, z: -1.5 }, sameFamily: false })
const anyStrongLine = officialSingle.s2 != null && officialSingle.s2 >= 0.6
if (officialSingle.probability >= 65 && !anyStrongLine) throw new Error('single strong line should stay')

if (highDimCount(ROBOT as never, table) < 6) throw new Error('robot should have many AI-direction dims')
if (highDimCount(HUMAN as never, table) >= highDimCount(ROBOT as never, table)) throw new Error('human dimHigh must be lower than robot')
console.log('verify-ai-detect-fusion OK', { human: h.probability, robot: r.probability })
