/**
 * Probe: hunting opening vs cold-open detector
 * Run: npx tsx scripts/probe-cold-hunt.ts
 */
import {
  detectChapterSeamColdOpen,
  extractOutlineBeatPhrases,
} from '../src/services/novel/novel-chapter-seam.js'
import { outlineBeatCoveredIn, beatAnchorTokens } from '../src/services/novel/novel-outline-beat-cover.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'

const outline =
  '精准击杀 / 设置简易陷阱，成功捕获两只肥美野兔。秦卫国熟练剥皮处理，没有浪费一丝血肉。回程路上，偶遇挑衅的赵大彪，秦卫国冷漠无视。'

const sample = [
  '秦卫国在松树后头蹲了整整两刻钟，膝窝压进雪里，棉裤早湿透了。风从垭口灌过来，刮得眼眶发干。',
  '雪窝口动了动，一只灰兔探出头，前爪刚迈出半步，细线就卡在前腿根那截最细的地方。它猛地一挣，套越收越紧。',
  '秦卫国几步蹿过去，摸出猎刀，照着后颈偏下那一处筋骨缝狠狠一剁，兔腿还在弹，皮毛却没伤着。',
  '第二只也是同一套法子。剥皮时他刀口利落，连血带肉都不浪费。',
  '回程路上赵大彪堵在道口挑衅，他冷着脸没理会，径直走了。',
].join('')

const beats = extractOutlineBeatPhrases(outline)
console.log('beats:', beats)
for (const b of beats) {
  console.log('—', b)
  console.log('  anchors', beatAnchorTokens(b))
  console.log('  covered', outlineBeatCoveredIn(sample, b))
}

const opening = sample.slice(0, 1400)
const headLen = Math.min(400, Math.max(160, Math.floor([...opening].length / 3)))
const head = [...opening].slice(0, headLen).join('')
console.log('headLen', headLen)
console.log('head:', head)
for (const b of beats.slice(0, Math.ceil(beats.length / 2))) {
  console.log('head cover', b.slice(0, 20), outlineBeatCoveredIn(head, b))
}

const cold = detectChapterSeamColdOpen({
  content: sample,
  chapterNumber: 5,
  prevChapterTail: '他推门走进夜色，雪地里留下两行脚印。苏婉把门栓插上，灯熄了。',
  chapterOutline: outline,
})
console.log('cold:', cold?.message || null)

const r = detectOutlineCompliance({
  content: sample.padEnd(2000, '。补充。'),
  chapterOutline: outline,
  prevChapterTail: '他推门走进夜色，雪地里留下两行脚印。苏婉把门栓插上，灯熄了。',
  chapterNumber: 5,
})
console.log(
  'compliance',
  r.ok,
  r.reasons.map(x => x.code),
)

if (cold) throw new Error('hunt paraphrase must NOT be cold open')
if (r.reasons.some(x => x.code === 'chapter_seam_cold_open')) {
  throw new Error('hunt paraphrase must NOT get chapter_seam_cold_open')
}
console.log('PASS hunt paraphrase')
