/**
 * npx tsx scripts/verify-seam-strip-opening.ts
 */
import {
  detectChapterSeamReplay,
  stripSeamReplayOpening,
  buildChapterSeamWriteBlock,
} from '../src/services/novel/novel-chapter-seam.js'

const prev =
  '秦卫国看着她，带着一丝若有若无的笑意，把糠饼又往她手里推了推。夜风从窗缝里进来，屋里只剩两个人的呼吸。'

const pad = '他起身去闩门，想着明天进山的事。门外雪壳子已被踩实。'
  + '他辨了辨方位。家属院后门的毛道上只有他一个人。'
  + '四斤肉省着吃够撑两顿。骨头皮子还能换玉米面。'.repeat(8)

const bad =
  '带着一丝若有若无的笑意还挂在他脸上。他把糠饼又往她手里推了推。'
  + pad

const hit = detectChapterSeamReplay({
  content: bad,
  chapterNumber: 2,
  prevChapterTail: prev,
})
if (!hit || hit.rule !== 'chapter_seam_replay') {
  throw new Error('expected seam replay on bad opening')
}

const s = stripSeamReplayOpening({
  content: bad,
  chapterNumber: 2,
  prevChapterTail: prev,
})
if (!s.stripped) throw new Error('expected strip')
if (/带着一丝若有若无/.test(s.text)) throw new Error('overlap phrase remains')
if (/糠饼又往她手里推/.test(s.text)) throw new Error('delivery replay remains')
const hit2 = detectChapterSeamReplay({
  content: s.text,
  chapterNumber: 2,
  prevChapterTail: prev,
})
if (hit2 && /高度重合/.test(hit2.message)) {
  throw new Error(`still overlaps after strip: ${hit2.message}`)
}

// 中间句夹带上章词组也应删
const mid = `天刚擦黑。带着一丝若有若无的笑意浮上他眼角。${pad}`
const s2 = stripSeamReplayOpening({
  content: mid,
  chapterNumber: 2,
  prevChapterTail: prev,
})
if (/带着一丝若有若无/.test(s2.text)) throw new Error('mid-sentence overlap remains')

const shortBlock = buildChapterSeamWriteBlock(prev + '后文'.repeat(200), { maxTailChars: 80 })
if ([...shortBlock].length > 900) throw new Error('maxTailChars not applied')

console.log('verify-seam-strip-opening OK')
