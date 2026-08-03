/**
 * 共处后先承接/离场再写猎获：不应判杂交冷头
 * npx tsx scripts/verify-seam-copresence-bridge.ts
 */
import {
  detectChapterSeamColdOpen,
  headLooksLikeCopresenceBridge,
} from '../src/services/novel/novel-chapter-seam.js'

const prevTail = `
秦卫国坐在她对面，拿起一根木料继续削第二副踏板的楔口。屋里只有柴火噼啪声和刀削木头的沙沙声。
窗外天色暗下来，风又起了。
`.trim()

const snap = {
  chapter_number: 10,
  time: '傍晚',
  place: '屋里',
  cast: '秦卫国、苏婉',
  last_event: '对坐削木缠绳',
  open_threads: '',
  updated_at: new Date().toISOString(),
}

const badHead = '雪光映进窗棂。秦卫国推门进来，提着一只狍子、两只野鸡。'
if (headLooksLikeCopresenceBridge(badHead, prevTail, snap)) {
  throw new Error('推门进来不应算桥接')
}

const goodHead = '秦卫国放下刀子，看了看苏婉缠好的绳。次日天亮，他披上大衣推门出去进山看套。'
if (!headLooksLikeCopresenceBridge(goodHead, prevTail, snap)) {
  throw new Error('承接+离场应算桥接')
}

const bridged = `
秦卫国放下刀子，看了看苏婉缠好的绳，屋里火光跳了跳。
次日天亮，他披上大衣推门出去，进山查看昨夜下的套。
林子里雪硬，套索里果然卡着一只狍子，旁边灌木还挂着两只野鸡。
他把猎物背回屋，分出一些肉给孤寡老人张伯，换些本地打猎的话。
苏婉把灶火烧旺，两人头一回吃上热腾腾的肉汤。
`.trim()

const cold = detectChapterSeamColdOpen({
  content: bridged,
  chapterNumber: 11,
  prevChapterTail: prevTail,
  chapterOutline: '意外收获 / 陷阱捕获了一只狍子和几只野鸡。秦卫国将部分肉送给孤寡老人张伯。',
  prevSnapshot: snap,
})
if (cold && /头段未进入|杂交|冷开篇/.test(cold.message) && !/在场吃书/.test(cold.message)) {
  throw new Error(`桥接稿不应再报杂交冷头：${cold.message}`)
}

const poison = `
雪光映进窗棂的时候，苏婉已经把灶火烧旺了。
秦卫国推门进来的时候，提着一只狍子、两只野鸡。
他把肉送给张伯，邻里关系好了起来。
`.trim()
const poisonHit = detectChapterSeamColdOpen({
  content: poison,
  chapterNumber: 11,
  prevChapterTail: prevTail,
  chapterOutline: '意外收获 / 陷阱捕获了一只狍子和几只野鸡。秦卫国将部分肉送给孤寡老人张伯。',
  prevSnapshot: snap,
})
if (!poisonHit) throw new Error('推门毒稿应仍被拦')

console.log('verify-seam-copresence-bridge OK')
