/**
 * 章末悬念勿揭晓 + 信息增量不当末拍 + 下章起因抢戏
 * npx tsx scripts/verify-ending-question-boundary.ts
 */
import { alignNovelChapterOutlineBoundary } from '../src/services/novel/novel-outline-boundary.js'
import {
  detectOutlineCompliance,
  detectNextChapterBeatLeak,
  detectSuspenseEndingResolved,
} from '../src/services/novel/novel-outline-compliance.js'
import { extractOutlineBeatPhrases, extractOutlineBoundaryLastBeat } from '../src/services/novel/novel-chapter-seam.js'

const ch4Outline = `第4章：初入林海
【本章时间】同日下午
【本章地点】北疆林场·白山林区
【本章人物】秦卫国
【本章起因】秦卫国踏入白雪皑皑的林场深处
【欲望】捕获猎物，解决温饱
【阻碍】极寒环境、体能尚未完全恢复
【局面变化】凭借前世特种兵的追踪技巧发现野兔踪迹
【人物选择】冷静判断，设下陷阱
【冲突层】外部
【情绪手法】冷峻的生存气息
【章末问题】陷阱能否奏效？
【信息增量】林场地形气候、特种兵野外生存能力展现
【主题回响】专业技能是资本`

const ch5Outline = `第5章：精准击杀
【本章起因】陷阱成功捕获野兔
【欲望】安全带猎物回家
【阻碍】回程偶遇挑衅的赵大彪
【局面变化】秦卫国冷漠无视，避免冲突升级
【人物选择】不与小人计较，专注回家
【章末问题】赵大彪的挑衅会不会变本加厉？`

const beats = extractOutlineBeatPhrases(ch4Outline)
if (beats.some(b => /林场地形气候/.test(b))) {
  throw new Error('信息增量不应进入情节拍点')
}
if (!beats.some(b => /设下陷阱/.test(b))) {
  throw new Error('应保留人物选择拍点')
}

const boundary = extractOutlineBoundaryLastBeat(ch4Outline)
if (!/设下陷阱/.test(boundary.lastBeat)) {
  throw new Error(`硬止点应为设下陷阱，实际 ${boundary.lastBeat}`)
}
if (!/能否奏效/.test(boundary.endingQuestion)) {
  throw new Error('应识别章末问题')
}

const align = alignNovelChapterOutlineBoundary({ chapterOutline: ch4Outline })
if (!align.endpointPending) throw new Error('章末问题应标 endpointPending')
if (!/设下陷阱/.test(align.lastBeat)) throw new Error(`align.lastBeat 应为设下陷阱：${align.lastBeat}`)
if (!align.boundaryBlock.includes('章末悬念')) throw new Error('边界块应含悬念禁揭晓')

const killProse = `
他贴着南坡走，发现野兔脚印，在灌木间设下活套。等了约莫一袋烟，兔子探头进来。
雪壳子在脚下轻响，他屏住呼吸，眼睛钉在绳圈上。风从坡顶灌下来，卷着雪沫打在脸上。
忽然兔子把脑袋探进缝里。麻绳顺着灌木枝滑下去，活套无声收拢，正卡在兔子脖子上。
兔子猛一挣，前爪刨雪，后腿乱蹬，越挣越紧，直到不动了。
秦卫国解下兔子掂了掂，少说三四斤，确认已经得手，又往林子深处藏好猎物，踩着脚印往回走。
天色更暗了些，风刮在脸上生疼，他只能先确认这一趟没有白跑。
`.trim()

const suspense = detectSuspenseEndingResolved({
  content: killProse,
  chapterOutline: ch4Outline,
  nextChapterOutline: ch5Outline,
})
if (!suspense) throw new Error('击杀收束应命中悬念揭晓（下章起因已落地）')
if (!/下章起因|捕获野兔/.test(suspense.message)) {
  throw new Error(`应走下章起因结构路径，实际：${suspense.message}`)
}

const leak = detectNextChapterBeatLeak({
  content: killProse,
  chapterOutline: ch4Outline,
  nextChapterOutline: ch5Outline,
})
if (!leak) throw new Error('应命中下章起因抢戏（捕获野兔）')

const okProse = `
他贴着南坡走，发现野兔脚印，在灌木间设下活套，蹲进背风阴影里。
雪地上有了动静，一只野兔在远处探头。他屏住气，盯着绳圈——还不知道这一套能不能成。
天色渐暗，他不敢乱动，心里只有一个问题：陷阱能否奏效？
`.trim()

if (detectSuspenseEndingResolved({ content: okProse, chapterOutline: ch4Outline })) {
  throw new Error('未揭晓悬念不应命中')
}

const full = detectOutlineCompliance({
  content: killProse,
  chapterOutline: ch4Outline,
  nextChapterOutline: ch5Outline,
  chapterNumber: 4,
})
if (!full.reasons.some(r => r.code === 'outline_endpoint_overshoot' || r.code === 'next_chapter_beat_leak')) {
  throw new Error(`综合合规应拦越界，实际 ${full.reasons.map(r => r.code).join(',')}`)
}

// 铁丝钩换皮得手：须仍命中悬念揭晓 + 下章抢戏
const hookProse = `
秦卫国这才慢慢睁开眼，目光越过雪地，落在那截埋在雪里的铁丝钩子上。钩尖上方，一只灰褐色的野兔正低着头，用前爪刨雪，露出下面干枯的草根。
秦卫国屏住呼吸，手指抠进身下的雪地里。那兔子往前挪了两步，正要往钩子旁边那撮干草上凑。咔嚓一声，铁丝钩子从雪里弹起来，倒刺勾住了兔子的后腿。
那兔子猛一挣，越挣嵌得越深。他从树底下站起来走过去，一手按住兔子脊背，轻轻一拧退倒刺。兔子抖了抖，就不动了。
秦卫国拎着兔子耳朵掂了掂，约莫两斤多沉，别在腰后，收起钩子绳子，瞅了瞅天色。雪已经小了，天也快黑了。
`.trim()
if (!detectSuspenseEndingResolved({
  content: hookProse,
  chapterOutline: ch4Outline,
  nextChapterOutline: ch5Outline,
})) {
  throw new Error('铁丝钩得手应命中悬念揭晓（下章起因已落地）')
}
if (!detectNextChapterBeatLeak({
  content: hookProse,
  chapterOutline: ch4Outline,
  nextChapterOutline: ch5Outline,
})) {
  throw new Error('铁丝钩得手应命中下章抢戏')
}

console.log('verify-ending-question-boundary OK')
