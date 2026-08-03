/**
 * 跨章交付重演（同场合一饼两吃 / 换时空可再写）
 * npx tsx scripts/verify-chapter-event-replay.ts
 */
import {
  deriveChapterEndSnapshot,
  detectChapterBodyEventReplay,
  extractClosedDeliveryBeats,
} from '../src/services/novel/novel-chapter-end-snapshot.js'
import { detectChapterSeamReplay } from '../src/services/novel/novel-chapter-seam.js'

const ch1 = `
夜里。屋里只剩他们俩。
“饿……饿吗？”一个细若蚊蚋的声音打断了他的思绪。
秦卫国回过神，看到苏婉颤抖着从怀里摸出半块发硬的糠饼。饼子黑乎乎的，边缘已经有些发霉。
“这是我……我白天省下来的。”她的声音里带着哭腔。
秦卫国看着那半块糠饼，心里像是被什么东西狠狠揪了一把。
前世的苏婉，就是这样一点一点把自己的口粮省下来给他。
“我不嫌弃。”他把糠饼接过来，掰成两半，大的一半塞回她手里。
`.trim()

/** 同夜同屋再掏出 → 应拦 */
const ch2SameOccasion = `
屋里还是那股潮气。秦卫国眼神变冷。
苏婉察觉到他的目光，肩膀抖了一下。她犹豫了片刻，才颤巍巍地从怀里掏出一个布包，一层层解开，露出里头半块黑乎乎的糠饼。
“你……你吃点吧。”苏婉的声音带着哭腔。
`.trim()

/** 次日 + 又掰 → 应放 */
const ch2NextDay = `
第二天早上，屋里透进一点光。苏婉又摸出半块糠饼，掰成两半递给他。
“再垫垫肚子。”
`.trim()

/** 换到门外 → 应放 */
const ch2NewPlace = `
邻居在墙外指指点点。秦卫国推门到了门外。
苏婉跟出来，从怀里掏出半块糠饼塞给他。
“先吃着。”
`.trim()

/** 仅回忆 → 应放 */
const ch2Memory = `
邻居在墙外指指点点，嘲笑他娶了个资本家小姐。
秦卫国想起昨晚那半块糠饼，心里一紧，却没有再去掏什么。
他握紧拳头，推门出去，准备先把米缸的事解决。
`.trim()

const props = extractClosedDeliveryBeats(ch1)
if (!props.some(p => p.includes('糠') || p === '糠饼')) {
  throw new Error(`应抽出糠饼类物件: ${props.join(',')}`)
}

const snap = deriveChapterEndSnapshot({ chapterNumber: 1, content: ch1 })
if (!snap?.closed_beats?.includes('糠')) {
  throw new Error(`snapshot closed_beats 应含糠: ${snap?.closed_beats}`)
}

const hit = detectChapterBodyEventReplay({
  content: ch2SameOccasion,
  chapterNumber: 2,
  prevChapterBody: ch1,
  prevSnapshot: snap,
})
if (!hit || !/同场合|情节重演/.test(hit.message)) {
  throw new Error(`同场合应拦: ${hit?.message}`)
}

const nextDay = detectChapterBodyEventReplay({
  content: ch2NextDay,
  chapterNumber: 2,
  prevChapterBody: ch1,
  prevSnapshot: snap,
})
if (nextDay) throw new Error(`次日再交付应放: ${nextDay.message}`)

const newPlace = detectChapterBodyEventReplay({
  content: ch2NewPlace,
  chapterNumber: 2,
  prevChapterBody: ch1,
  prevSnapshot: snap,
})
if (newPlace) throw new Error(`换场再交付应放: ${newPlace.message}`)

const ok = detectChapterBodyEventReplay({
  content: ch2Memory,
  chapterNumber: 2,
  prevChapterBody: ch1,
  prevSnapshot: snap,
})
if (ok) throw new Error(`仅回忆不应拦: ${ok.message}`)

const seam = detectChapterSeamReplay({
  content: ch2SameOccasion,
  chapterNumber: 2,
  prevChapterTail: ch1.slice(-800),
  prevChapterBody: ch1,
  chapterOutline: '地狱开局 / 邻居嘲笑 / 决定改变',
  prevSnapshot: snap,
})
if (!seam) throw new Error('seam 路径应命中同场合交付重演')

console.log('verify-chapter-event-replay OK', {
  props,
  closed: snap.closed_beats,
  place: snap.place,
  time: snap.time,
})
