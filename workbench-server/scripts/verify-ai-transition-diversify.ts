/**
 * 衔接词打散应消掉紧接着/微微/忍不住等，并降低 transition 维
 * npx tsx scripts/verify-ai-transition-diversify.ts
 */
import { diversifyNovelProseTells } from '../src/common/novel/novel-prose-diversify.js'
import { detectAiText } from '../src/services/ai/ai-text-detection.js'

const raw = [
  '油脂碰撞发出声响。紧接着清水没过肉块，大火烧开。',
  '有个半大小子忍不住，蹲在墙根闻了又闻。',
  '她身子微微发抖，眼眶一热。',
  '秦卫国看着她，嘴角微微上扬一下。',
  '他猛地抬起头，仿佛听见什么。',
].join('\n\n')

const before = detectAiText(raw.repeat(3))
const out = diversifyNovelProseTells(raw.repeat(3))
const after = detectAiText(out)

for (const bad of ['紧接着', '忍不住', '微微', '嘴角微微', '猛地']) {
  if (out.includes(bad)) throw new Error(`打散后仍含「${bad}」`)
}

const tBefore = before.signals.find(s => s.key === 'transition_patterns')?.score ?? 0
const tAfter = after.signals.find(s => s.key === 'transition_patterns')?.score ?? 0
if (tAfter >= tBefore && tBefore >= 0.3) {
  throw new Error(`衔接词维应下降：${Math.round(tBefore * 100)} → ${Math.round(tAfter * 100)}`)
}

console.log('verify-ai-transition-diversify OK', {
  transitionBefore: Math.round(tBefore * 100),
  transitionAfter: Math.round(tAfter * 100),
  probBefore: before.probability,
  probAfter: after.probability,
})
