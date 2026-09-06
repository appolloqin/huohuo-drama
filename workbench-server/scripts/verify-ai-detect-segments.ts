// scripts/verify-ai-detect-segments.ts
import { buildFusedSegments, bandFromAigc } from '../src/services/ai/ai-detect-segments.js'
import { DEFAULT_PERCENTILE_TABLES } from '../src/services/ai/ai-detect-calibration.js'
import { seedFusionWeights } from '../src/services/ai/ai-evidence-rules.js'
import { fuseEvidence, segmentAigc } from '../src/services/ai/ai-detect-fusion.js'
import { extractRawFeatures } from '../src/services/ai/ai-detect-features.js'

const aiPara = '首先我们需要认识到问题的复杂性。其次应当从多个维度进行分析。与此同时数据积累不可或缺。此外值得注意的是任何结论都需证据。综上所述系统性推进才能取得实质进展。'.repeat(6)
const humanPara = '雨下了三天。瓦缝里的水线越来越粗，滴进脸盆，叮咚作响。阿桂把最后的干柴抱进灶房，骂了句老天，声音却在抖。\n\n"柴不够。"她说。\n\n"够。"他不敢看她的眼睛，"明早前雨停就行。"\n\n"要是没停呢？"他没接话。灶膛的火苗舔着锅底，影子在土墙上晃。他想起去年秋收时存的那垛稻草，还压在场院东头，可这时候出去，跟泡在水里没什么两样。'
const text = aiPara + '\n\n' + humanPara + '\n\n' + aiPara + '\n\n' + humanPara

const deps = {
  genre: 'web_fiction' as const,
  table: DEFAULT_PERCENTILE_TABLES.web_fiction,
  weights: seedFusionWeights('web_fiction'),
  ref: { mode: 'echo' as const, model: 'qwen-test@1', z: -1.8, calibrated: true },
  sameFamily: false,
  fpSim: null,
  perturbStab: null,
}
const segs = buildFusedSegments(text, deps)
if (segs.length < 2) throw new Error('need multi segments')
if (segs[0]!.aigc <= segs[1]!.aigc) throw new Error(`segment order: ${segs.map(s => s.aigc).join(',')}`)
if (segs[0]!.band !== 'ai' && segs[0]!.probability < 65) throw new Error('first (AI) segment not flagged')
// 口径一致性：段分与直接对该段文本 fuseEvidence 完全相等
const probe = segs[0]!
const direct = fuseEvidence({ ...deps, raws: extractRawFeatures(text.slice(probe.char_start, probe.char_end)) })
if (Math.abs(segmentAigc(direct) - probe.aigc) > 1e-9) throw new Error('global/segment fusion divergence')
// 局部覆盖回调生效
const override = buildFusedSegments(text, { ...deps, localRefOf: (s) => (s.index % 2 === 0 ? null : deps.ref) })
if (override[0]!.probability >= segs[0]!.probability) throw new Error('localRefOf not applied (S2 removed should lower prob)')
if (bandFromAigc(override[1]!.aigc) !== segs[1]!.band) throw new Error('non-local seg changed unexpectedly')
console.log('verify-ai-detect-segments OK', segs.map((s) => `${s.band}:${s.aigc}`).join(' '))
