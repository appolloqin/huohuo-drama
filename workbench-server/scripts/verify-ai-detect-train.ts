// scripts/verify-ai-detect-train.ts
import {
  logisticTrain, metricsAt, twoFoldMetrics, buildPercentiles, buildPplTracks, passesGuardrail,
  type TrainSample,
} from '../src/common/novel/novel-detect-train.js'
import { CALIB_MAX_HUMAN_FPR, CALIB_MIN_AI_RECALL } from '../src/common/novel/novel-detect-calib.js'

void CALIB_MAX_HUMAN_FPR
void CALIB_MIN_AI_RECALL

// 线性可分玩具集：AI 样本第二维高
function gen(n: number, cls: 0 | 1): TrainSample[] {
  return Array.from({ length: n }, (_, i) => ({
    x: [0.5 + (i % 5) * 0.02, cls === 1 ? 0.8 + (i % 4) * 0.02 : 0.15 + (i % 4) * 0.02, cls === 1 ? 1 : 0],
    y: cls,
    label: cls === 0 ? 'human' : 'ai',
    genre: 'web_fiction',
  }))
}
const data = [...gen(12, 0), ...gen(12, 1)]
const m = logisticTrain(data, { iters: 3000 })
if (metricsAt(m, data).accuracy < 0.9) throw new Error('train diverged')
const eval2 = twoFoldMetrics(data, m)
if (!(eval2.fpr <= 0.2 && eval2.recall >= 0.8)) throw new Error('2fold: ' + JSON.stringify(eval2))
if (passesGuardrail({ metrics: { fpr: 0.05, recall: 0.9, minOk: true }, minPerClass: 8, counts: { human: 12, ai: 12 } }).ok !== true) {
  throw new Error('guardrail should pass')
}
if (passesGuardrail({ metrics: { fpr: 0.5, recall: 0.9, minOk: true }, minPerClass: 8, counts: { human: 12, ai: 12 } }).ok !== false) {
  throw new Error('guardrail fail case')
}
if (passesGuardrail({ metrics: { fpr: 0.05, recall: 0.5, minOk: true }, minPerClass: 8, counts: { human: 12, ai: 12 } }).ok !== false) {
  throw new Error('recall guardrail')
}
if (passesGuardrail({ metrics: { fpr: 0.05, recall: 0.9, minOk: true }, minPerClass: 8, counts: { human: 8, ai: 4 } }).ok !== false) {
  throw new Error('sample size guardrail')
}

const pct = buildPercentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
// p05≈1.45；p50(median, index 2)≈5.5（linear (n-1)*p）
if (!(pct.length === 6 && Math.abs(pct[0]! - 1.45) < 0.15 && Math.abs(pct[2]! - 5.5) < 0.15)) {
  throw new Error('percentiles: ' + JSON.stringify(pct))
}
const tracks = buildPplTracks([
  { ppl: 18, refModel: 'qwen-test', mode: 'echo' },
  { ppl: 22, refModel: 'qwen-test', mode: 'echo' },
  { ppl: 4, refModel: 'qwen-test', mode: 'echo' },
  { ppl: 5.5, refModel: 'other', mode: 'proxy' },
  { ppl: 8, refModel: 'other', mode: 'proxy' },
  { ppl: 7, refModel: 'other', mode: 'proxy' },
])
const t1 = tracks['qwen-test']?.echo
// ppl=18/22/4：mu=44/3≈14.667；总体 sd=√(((18−μ)²+(22−μ)²+(4−μ)²)/3)≈7.72
if (!t1 || Math.abs(t1.mu - 14.667) > 0.01 || Math.abs(t1.sd - 7.717) > 0.01) {
  throw new Error('ppl tracks: ' + JSON.stringify(t1))
}
if (!tracks['other']?.proxy || Math.abs((tracks['other']?.proxy || { mu: 0 }).mu - 6.833) > 0.01) {
  throw new Error('proxy bucket')
}
console.log('verify-ai-detect-train OK')
