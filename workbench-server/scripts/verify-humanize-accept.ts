/**
 * 去 AI 味采纳门（G14）：纯分段指标优先；总分下降次之；持平看 PPL/顶信号。
 * npx tsx scripts/verify-humanize-accept.ts
 */
import {
  isPerplexityImproved,
  shouldAcceptHumanizePass,
} from '../src/services/novel/novel-chapter-ai-humanize-hook.js'

if (!shouldAcceptHumanizePass(45, 40)) throw new Error('下降应采纳')
if (shouldAcceptHumanizePass(40, 40)) throw new Error('持平且无信号改善不应采纳')
if (shouldAcceptHumanizePass(40, 45)) throw new Error('升高必须拒绝')
if (!shouldAcceptHumanizePass(44, 44, { beforeTopSignal: 0.8, afterTopSignal: 0.28 })) {
  throw new Error('持平但最高维明显下降应采纳')
}
if (shouldAcceptHumanizePass(44, 44, { beforeTopSignal: 0.8, afterTopSignal: 0.75 })) {
  throw new Error('持平且最高维几乎不变不应采纳')
}

// 97% 封顶：PPL 1.28 → 2.0 仍显示 97，但应采纳
if (!shouldAcceptHumanizePass(97, 97, {
  beforePerplexity: 1.28,
  afterPerplexity: 2.0,
})) {
  throw new Error('PPL 明显升高（同为 97%）应采纳')
}
if (shouldAcceptHumanizePass(97, 97, {
  beforePerplexity: 1.28,
  afterPerplexity: 1.35,
})) {
  throw new Error('PPL 微升不应采纳')
}
if (!isPerplexityImproved(1.28, 2.0)) throw new Error('isPerplexityImproved true')
if (isPerplexityImproved(2.0, 1.5)) throw new Error('isPerplexityImproved false on drop')

// G14：总分升高但段高危下降 → 仍采纳
if (!shouldAcceptHumanizePass(90, 95, { beforeHighBand: 3, afterHighBand: 1 })) {
  throw new Error('seg highBand drop should accept even if prob rises')
}
// G14：总分持平 + meanAigc 下降 → 采纳
if (!shouldAcceptHumanizePass(60, 60, { beforeMeanAigc: 0.55, afterMeanAigc: 0.4 })) {
  throw new Error('meanAigc drop should accept')
}
// G14：总分升高 + 分段无改善 → 拒绝（旧实现曾因 PPL 允许）
if (shouldAcceptHumanizePass(90, 95, {
  beforeHighBand: 2,
  afterHighBand: 2,
  beforeMeanAigc: 0.5,
  afterMeanAigc: 0.5,
  beforePerplexity: 1.0,
  afterPerplexity: 2.0,
})) {
  throw new Error('prob rise without seg improve must reject even if PPL up')
}
// 综合用例
if (!shouldAcceptHumanizePass(80, 75, {
  beforeMeanAigc: 0.55,
  afterMeanAigc: 0.55,
  beforeHighBand: 3,
  afterHighBand: 2,
  beforePerplexity: 10,
  afterPerplexity: 10,
  beforeTopSignal: 0.6,
  afterTopSignal: 0.55,
})) {
  throw new Error('combined case should accept')
}

console.log('verify-humanize-accept OK')
