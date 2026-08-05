/**
 * npx tsx scripts/verify-catalyst-agency.ts
 * 方案 A：仅结构检测（tipContinue + 起因未覆盖）；无第三方词表。
 */
import { detectCatalystAgencyFail } from '../src/services/novel/novel-outline-compliance.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'

const hunt = `精准击杀
【本章时间】同日下午至傍晚
【本章地点】白山林区·回程小路
【本章人物】秦卫国、赵大彪
【本章起因】陷阱成功捕获野兔
【欲望】安全带猎物回家
【阻碍】回程偶遇挑衅的赵大彪
【局面变化】秦卫国冷漠无视，避免冲突升级
【人物选择】不与小人计较，专注回家
【冲突层】人际
【情绪手法】沉稳压抑，反派先亮相
【章末问题】赵大彪的挑衅会不会变本加厉？
【信息增量】赵大彪的人物形象、秦卫国的克制
【主题回响】不和苍蝇论长短`

if (resolveChapterBeatBudgets({ chapterOutline: hunt, userTarget: 2800 }).items[0]?.phase !== '起因') {
  throw new Error('hunt phase')
}

const prevTip = `风向变了。带着一丝若有若无的腥气。秦卫国目光扫向岩壁上方那片被雪半掩的阴影。阴影里有什么东西被雪盖住了大半，只露出一截枯黄的茎秆。他眯起眼！`

const tipContinueOpen = (
  '那片阴影像被人扯开一道口子。秦卫国没再盯那截枯茎。铁丝套子里卡着灰褐色的毛。'
  + '这套子下得刁，不在他昨晚踩过的那几个点上。说明下套子的人来得不早。'
).repeat(2)

const hit = detectCatalystAgencyFail({
  content: tipContinueOpen,
  chapterOutline: hunt,
  prevChapterTail: prevTip,
})
if (!hit || hit.code !== 'catalyst_agency_fail') {
  throw new Error(`tip-continue expected fail, got ${JSON.stringify(hit)}`)
}

const covered = (
  '秦卫国顺着自己昨晚下的草绳套子走过去，套子收得紧，里头卡着一只野兔。'
  + '陷阱成功捕获野兔，他亲手收网，猎获到手，背篓塞实往回程走。'
).repeat(2)
if (detectCatalystAgencyFail({ content: covered, chapterOutline: hunt, prevChapterTail: prevTip })) {
  throw new Error('false positive when catalyst covered')
}

// 无上章末重合、仅「别人」叙事：方案 A 不靠词表拦（应由生成侧不喂原文）
const noTip = detectCatalystAgencyFail({
  content: ('会议室里方案被别人改了，晨会通过作废。林晚愣在当场。').repeat(8),
  chapterOutline: `第3章
【本章时间】周一
【本章地点】会议室
【本章人物】林晚
【本章起因】方案已在晨会通过
【欲望】守住主导权
【阻碍】总监改口
【局面变化】要抢回话语权
【人物选择】摊数据
【冲突层】人际
【情绪手法】克制
【章末问题】去不去酒局？
【信息增量】真因
【主题回响】规则`,
  prevChapterTail: '',
})
if (noTip) throw new Error('should not use foreign-word table without tip continue')

console.log('verify-catalyst-agency OK (structural tip-continue only)')
