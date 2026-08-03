/**
 * 去 AI 味采纳门：分数升高必须丢弃；持平但最高维明显下降可采纳
 * npx tsx scripts/verify-humanize-accept.ts
 */
import { shouldAcceptHumanizePass } from '../src/services/novel/novel-chapter-ai-humanize-hook.js'

if (!shouldAcceptHumanizePass(45, 40)) throw new Error('下降应采纳')
if (shouldAcceptHumanizePass(40, 40)) throw new Error('持平且无信号改善不应采纳')
if (shouldAcceptHumanizePass(40, 45)) throw new Error('升高必须拒绝')
if (!shouldAcceptHumanizePass(44, 44, { beforeTopSignal: 0.8, afterTopSignal: 0.28 })) {
  throw new Error('持平但最高维明显下降应采纳')
}
if (shouldAcceptHumanizePass(44, 44, { beforeTopSignal: 0.8, afterTopSignal: 0.75 })) {
  throw new Error('持平且最高维几乎不变不应采纳')
}

console.log('verify-humanize-accept OK')
