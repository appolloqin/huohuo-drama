/**
 * 通用场合跳切：契约地点键不同且无过渡 → hard；有过渡放行
 * npx tsx scripts/verify-seam-place-jump.ts
 */
import {
  detectSeamPlaceJump,
  openingHasSeamBridge,
} from '../src/services/novel/novel-chapter-end-snapshot.js'
import { buildForcedSeamOpeningBlock, buildChapterSeamWriteBlock } from '../src/services/novel/novel-chapter-seam.js'

const prevTail = `
对方把东西推回来，浑浊的眼珠子一转：「这我不要。」
来人僵在炕沿上，手里的东西递不出去，也收不回来。
屋里只剩灶火噼啪两声。
`.trim()

const snap = {
  chapter_number: 11,
  time: '傍晚',
  place: '对户小屋',
  cast: '来人、对户',
  last_event: '对户拒收物件，来人僵于炕沿',
  open_threads: '',
  updated_at: new Date().toISOString(),
}

const poison = `
灶房里热气扑脸，锅沿还挂着昨夜的水汽。院门被拍得砰砰响。
有人在外头叫门，笑着说上门关心，要进来坐坐。
`.trim()

const hit = detectSeamPlaceJump({
  content: poison,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (!hit || !/场合跳切/.test(hit.message)) {
  throw new Error(`专名小屋→另一室内无过渡应拦：${hit?.message}`)
}

const bridged = `
他告辞出了门。次日晌午回到自家院，灶房里还温着。
院门忽然被拍响，外头有人笑着说上门关心。
`.trim()
const ok = detectSeamPlaceJump({
  content: bridged,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (ok) throw new Error(`有离场跨日过渡不应拦：${ok.message}`)

// 「数日后」同属合法跨日桥（模型常写数日后上午换场）
const daysLater = `
数日后上午，院门口冻土发硬。他擦了把手，踱到院门口，拨开门闩探出半张脸。
外头站着来人，笑着说上门关心。
`.trim()
const daysOk = detectSeamPlaceJump({
  content: daysLater,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (daysOk) throw new Error(`数日后换场不应拦：${daysOk.message}`)

if (!openingHasSeamBridge(daysLater)) throw new Error('数日后须识别为 seam bridge')

const samePlace = `
门外忽然响起敲门声。他透过门缝看清来人，才开了一条缝应付几句。
`.trim()
const homeSnap = {
  ...snap,
  place: '屋里',
  last_event: '把门闩插死，搁好东西',
}
const sameOk = detectSeamPlaceJump({
  content: samePlace,
  chapterNumber: 12,
  prevChapterTail: '他把门闩插死，把东西搁在灶台边。这一趟人情算是还上了。',
  prevSnapshot: homeSnap,
})
if (sameOk) throw new Error(`同场合门口来客不应场合跳切：${sameOk.message}`)

const forced = buildForcedSeamOpeningBlock({
  chapterOutline: '外来者上门试探，主角周旋',
  prevTail,
  prevSnapshot: snap,
})
if (!/场合连续|场合不同须过渡|须先写过渡/.test(forced)) {
  throw new Error(`强制接缝应含场合连续：${forced.slice(0, 200)}`)
}
if (/他处收束|告辞\/离场或跨日.*归家/.test(forced)) {
  throw new Error('不应再含归家特例文案')
}

const seam = buildChapterSeamWriteBlock(prevTail, { prevSnapshot: snap })
if (/【上章结尾（须承接/.test(seam) || prevTail.slice(0, 20) && seam.includes(prevTail.slice(0, 12))) {
  throw new Error('接缝块不得附上章末原文')
}
if (!/上章末契约/.test(seam)) throw new Error('接缝块须含结构化契约')

console.log('verify-seam-place-jump OK')
