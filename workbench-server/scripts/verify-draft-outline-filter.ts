/**
 * 生成前旧稿裁定验收
 * Run: npx tsx scripts/verify-draft-outline-filter.ts
 */
import { filterDraftByChapterOutline } from '../src/services/novel/novel-draft-outline-filter.js'

function pad(s: string, n: number): string {
  let out = s
  while ([...out].length < n) out += s
  return out
}

const outline = '当众摊牌 / 出示关键证物逼对方让步 / 对方反咬一口 / 主角冷处理收束'
const prev = pad('证物已经到手。他收起纸袋，转身走进雨里，街灯把影子拉得很长。', 200)
const leaveHome = pad(
  '天没亮他就醒了。穿好衣服嘱咐家人锁门，推门走进雨夜街巷，一路想着白天的琐事。',
  400,
)
const withBeat = pad(
  '雨夜里他当众摊牌，把关键证物拍在桌上逼对方让步。对方脸色铁青，当场反咬一口。',
  300,
)

const r1 = filterDraftByChapterOutline({
  existingText: leaveHome + withBeat,
  chapterOutline: outline,
  prevChapterTail: prev,
  chapterNumber: 5,
})
console.log(
  'hybrid discardedStructure:',
  r1.discardedStructure,
  'keep:',
  r1.keepCount,
  'discard:',
  r1.discardCount,
)
if (!r1.discardedStructure) throw new Error('expected discarded structure for leave-home opening')
if (!r1.promptBlock.includes('开篇骨架已作废')) {
  throw new Error('expected opening-void notice')
}
if (/天没亮|嘱咐家人锁门|已丢弃旧文摘录/.test(r1.promptBlock)) {
  throw new Error('must not paste leave-home or discard excerpts into prompt')
}
if (r1.keepCount < 1 || !/当众摊牌|证物/.test(r1.promptBlock)) {
  throw new Error('hybrid must keep outline-related valuable sentences')
}
console.log('filter hybrid ok (keep valuable, drop leave-home)')

const r2 = filterDraftByChapterOutline({
  existingText: withBeat,
  chapterOutline: outline,
  prevChapterTail: prev,
  chapterNumber: 5,
})
console.log('beat-only discardedStructure:', r2.discardedStructure, 'keep:', r2.keepCount)
if (r2.discardedStructure) throw new Error('beat-aligned draft should not discard structure')
if (r2.keepCount < 1) throw new Error('expected keep outline-related sentences')

const r3 = filterDraftByChapterOutline({
  existingText: leaveHome,
  chapterOutline: outline,
  prevChapterTail: prev,
  chapterNumber: 5,
})
console.log('leave-only discardedStructure:', r3.discardedStructure, 'keep:', r3.keepCount)
if (!r3.discardedStructure || r3.keepCount !== 0) {
  throw new Error('leave-home-only must discard structure with zero keep')
}
if (/天没亮|已丢弃旧文摘录/.test(r3.promptBlock)) {
  throw new Error('leave-only must not paste old sentences')
}

console.log('PASS')
