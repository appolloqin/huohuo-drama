/**
 * npx tsx scripts/verify-structured-seam-pending-catalyst.ts
 */
import { buildChapterSeamWriteBlock } from '../src/services/novel/novel-chapter-seam.js'
import { detectCatalystAgencyFail } from '../src/services/novel/novel-outline-compliance.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'

const outline = `精准击杀
【本章时间】同日下午至傍晚
【本章地点】白山林区·回程小路
【本章人物】秦卫国、赵大彪
【本章起因】陷阱成功捕获野兔
【欲望】安全带猎物回家
【阻碍】回程偶遇挑衅的赵大彪
【局面变化】秦卫国冷漠无视，避免冲突升级
【人物选择】不与小人计较，专注回家
【冲突层】人际
【情绪手法】沉稳压抑
【章末问题】会否变本加厉？
【信息增量】形象与克制
【主题回响】不和苍蝇论长短`

const prevTip = `风向变了。带着一丝若有若无的腥气。秦卫国目光扫向岩壁上方那片被雪半掩的阴影。阴影里有什么东西被雪盖住了大半，只露出一截枯黄的茎秆。他眯起眼！`

const snap = {
  chapter_number: 4,
  time: '同日下午',
  place: '白山林区',
  cast: '秦卫国',
  last_event: '发现岩壁阴影下有异物',
  open_threads: '',
  closed_beats: '',
  content_hash: '',
  updated_at: '',
}

const withRaw = buildChapterSeamWriteBlock(prevTip, { maxTailChars: 200 })
if (!withRaw.includes('【上章结尾')) throw new Error('expected raw tip block')
if (withRaw.includes('结构化')) throw new Error('raw mode should not say 结构化')

const factsOnly = buildChapterSeamWriteBlock(prevTip, {
  omitRawPrevProse: true,
  prevSnapshot: snap,
})
if (factsOnly.includes(prevTip.slice(-40))) throw new Error('must omit raw tip prose')
if (!factsOnly.includes('结构化')) throw new Error('expected structured facts')
if (!factsOnly.includes('末事件')) throw new Error('expected last_event')
if (!factsOnly.includes('须先写清该起因')) throw new Error('expected catalyst hard line')

if (resolveChapterBeatBudgets({ chapterOutline: outline, userTarget: 2800 }).items[0]?.phase !== '起因') {
  throw new Error('phase tag')
}

const badOpen = (
  '那片阴影像被人扯开一道口子。秦卫国没再盯那截枯茎。铁丝从雪里扯出来，套子里卡着灰褐色的毛。'
  + '这套子下得刁，不在他昨晚踩过的点上。说明下套子的人来得不早。'
).repeat(2)
const hit = detectCatalystAgencyFail({
  content: badOpen,
  chapterOutline: outline,
  prevChapterTail: prevTip,
})
if (!hit || hit.code !== 'catalyst_agency_fail') {
  throw new Error(`expected tip-continue fail, got ${JSON.stringify(hit)}`)
}

const goodOpen = (
  '秦卫国顺着自己昨晚下的草绳套子走过去，套子收得紧，里头卡着一只野兔，已经不动了。'
  + '陷阱成功捕获野兔，他亲手收网，猎获到手，背篓塞实，抬脚往回程小路走。'
).repeat(2)
if (detectCatalystAgencyFail({ content: goodOpen, chapterOutline: outline, prevChapterTail: prevTip })) {
  throw new Error('false positive on covered catalyst')
}

console.log('verify-structured-seam-pending-catalyst OK')
