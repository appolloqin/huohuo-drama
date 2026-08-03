/**
 * 章缝事件回放（题材无关）：契约 last_event + cast + 文本重合
 * Run: npx tsx scripts/verify-seam-climax-replay.ts
 */
import {
  detectChapterSeamClimaxReplay,
  detectChapterSeamReplay,
} from '../src/services/novel/novel-chapter-seam.js'
import { detectOpeningAgainstChapterEndSnapshot } from '../src/services/novel/novel-chapter-end-snapshot.js'
import type { ChapterEndSnapshot } from '../src/common/novel/novel-continuity-state.js'

// —— 案例 A：乡村对峙（不应依赖「棍子/交出来」词表才能命中）——
const prevTailA = `
林远站在门口，当着众人把话说死：“今日我要娶柳如梅。”
赵德柱脸色铁青，人群哗然。这一局暂时收住，夜色压下来。
`.repeat(2)

const snapA: ChapterEndSnapshot = {
  chapter_number: 3,
  time: '夜色',
  place: '村口门外',
  cast: '林远、柳如梅、赵德柱',
  last_event: '林远当众宣布要娶柳如梅，赵德柱震怒，场面收住',
  updated_at: new Date().toISOString(),
}

const openReplayA = `
林远又站回门口，当着众人把话重说一遍：“今日我要娶柳如梅。”
赵德柱脸色铁青，人群再次哗然。
`.repeat(2)

if (!detectChapterSeamClimaxReplay({
  content: openReplayA,
  chapterNumber: 4,
  prevChapterTail: prevTailA,
  prevSnapshot: snapA,
})) throw new Error('A: expected event replay')

// —— 案例 B：猎村对峙（回归）——
const prevTailB = `
赵大彪堵在道口：“交出来！今儿由不得你。”
秦卫国没挪步。雪地上两个人僵在那儿。
秦卫国道：“你家里今儿炖肉了。”赵大彪一愣。
`.repeat(2)

const snapB: ChapterEndSnapshot = {
  chapter_number: 4,
  time: '正午后',
  place: '归途雪道',
  cast: '秦卫国、赵大彪',
  last_event: '回程遇赵大彪挑衅逼交猎物，对峙未散',
  updated_at: new Date().toISOString(),
}

const openReplayB = `
他没挪步，也没回话。雪地上两个人僵在那儿。
赵大彪等了几息：“交不交？”
“你家里今儿炖肉了。”秦卫国忽然开口。
`.repeat(2)

if (!detectChapterSeamClimaxReplay({
  content: openReplayB,
  chapterNumber: 5,
  prevChapterTail: prevTailB,
  prevSnapshot: snapB,
})) throw new Error('B: expected climax replay')

if (!detectChapterSeamReplay({
  content: openReplayB,
  chapterNumber: 5,
  prevChapterTail: prevTailB,
  chapterOutline: '设陷阱 / 剥皮 / 回程遇赵大彪',
  prevSnapshot: snapB,
})) throw new Error('B: seam replay should catch')

const cleanB = `
日头还偏西，秦卫国绕过岔路口，把猎物往背篓里压实，没再回头。
`.repeat(3)
if (detectChapterSeamClimaxReplay({
  content: cleanB,
  chapterNumber: 5,
  prevChapterTail: prevTailB,
  prevSnapshot: snapB,
})) throw new Error('B: clean continue must not hit')

// —— 地点/经过：契约地点与刚发生均未出现在开篇 ——
const placeHit = detectOpeningAgainstChapterEndSnapshot({
  content: ('他推开自家屋门，坐回桌边倒了碗热水，想起明天的会。').repeat(4),
  chapterNumber: 5,
  prevSnapshot: snapB,
})
if (!placeHit || !/地点\/经过倒退/.test(placeHit.message)) {
  throw new Error(`expected place/event miss: ${placeHit?.message}`)
}

// 源码不得再依赖场面专词表
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const seamSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/novel/novel-chapter-seam.ts'),
  'utf8',
)
if (/交出来|交不交|勒索/.test(seamSrc) || /棍子\|挑衅\|对峙/.test(seamSrc)) {
  throw new Error('climax replay must not use confrontation verb wordlist')
}
const snapSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/novel/novel-chapter-end-snapshot.ts'),
  'utf8',
)
if (/炕\|外屋|林\|雪地\|树\|岩壁/.test(snapSrc)) {
  throw new Error('place check must not use indoor/outdoor scene wordlist')
}

console.log('PASS')
