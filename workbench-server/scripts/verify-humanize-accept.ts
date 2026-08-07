/**
 * 去 AI 味采纳门：分数升高必须丢弃；持平但最高维明显下降可采纳；
 * PPL 顶在 97% 封顶时，原始困惑度升高也可采纳
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

console.log('verify-humanize-accept OK')
