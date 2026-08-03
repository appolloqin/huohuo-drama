/**
 * npx tsx scripts/verify-chapter-beat-budget.ts
 */
import { resolveChapterBeatBudgets, beatWeightTemplate } from '../src/services/novel/novel-chapter-beat-budget.js'

const w3 = beatWeightTemplate(3)
if (Math.abs(w3.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error('w3 sum')

const outline = '环顾四周家徒四壁米缸见底 / 邻居墙外指指点点嘲笑资本家小姐 / 秦卫国眼神变冷握紧拳头决定不再重蹈前世覆辙'
const r = resolveChapterBeatBudgets({
  chapterOutline: outline,
  userTarget: 2800,
  endpointPending: true,
})
if (r.beatCount !== 3) throw new Error(`beats ${r.beatCount}`)
const sum = r.items.reduce((a, it) => a + it.targetChars, 0)
if (sum !== 2800) throw new Error(`sum ${sum}`)
if (!r.promptBlock.includes('篇幅预算')) throw new Error('no block')
if (!r.promptBlock.includes('0 字')) throw new Error('no zero after last')
if (r.items[2]!.phase !== '收束') throw new Error('last phase')

const one = resolveChapterBeatBudgets({
  chapterOutline: '他决定改变命运从此不同',
  userTarget: 1200,
  endpointPending: true,
})
if (one.beatCount !== 1 || one.items[0]!.targetChars !== 1200) {
  throw new Error('single beat')
}

console.log('verify-chapter-beat-budget OK', {
  phases: r.items.map(i => `${i.phase}:${i.targetChars}`),
})
