/**
 * 冷开篇硬门槛：【本章起因】或无标签时「第一条实质拍」；其余拍不进硬门槛
 * npx tsx scripts/verify-cold-open-structural-beats.ts
 */
import { detectChapterSeamColdOpen } from '../src/services/novel/novel-chapter-seam.js'

const outline = `第7章：夜间试探
【本章时间】深夜
【本章地点】秦卫国家门外
【本章人物】秦卫国、赵大彪及其同伙
【本章起因】赵大彪带人试图撬门骚扰
【欲望】震慑宵小，保护妻子
【阻碍】对方人多势众
【局面变化】秦卫国未动声色，黑暗中磨刀
【人物选择】以沉默的威慑让对方知难而退
【冲突层】外部、人际
【情绪手法】压抑的紧张感，刀声渲染寒气
【章末问题】赵大彪会不会善罢甘休？
【信息增量】秦卫国的心理战术、赵大彪的色厉内荏
【主题回响】真正的强者不战而屈人之兵`

const prevTail = '屋里兔汤见了底。秦卫国把门关严，苏婉靠着炕沿歇气。门外风大，这一夜本该清静。门外有人脚步声渐近，有人喊了一声。'

// 起因意译（拍门≈撬门）即过；勿要求欲望/磨刀字面
const goodOpen = `
夜深了。门外有人来。赵大彪带着人压到门前，拍门叫骂，门板被拍得咚咚响。
苏婉缩在炕角不敢出声。秦卫国把门闩死，先听外面动静。
`.repeat(3)

const coldGood = detectChapterSeamColdOpen({
  content: goodOpen,
  chapterNumber: 7,
  prevChapterTail: prevTail,
  chapterOutline: outline,
})
if (coldGood) {
  throw new Error(`起因意译仍冷开篇: ${coldGood.message}`)
}

// 纯盘点/回忆、无人来闹：仍应冷开篇；提示只含起因，不含抽象欲望
const badOpen = `
他想起白天的饭香，又想起邻居伸脖子张望的样子。屋里只剩他和苏婉，稻草扎人。
他决定明天再进山看看有没有冻死的野物。眼下先挨过这一夜。
风灌进墙缝，灯芯跳了跳。他没出门，也没听见门外有任何脚步。
`.repeat(5)

const coldBad = detectChapterSeamColdOpen({
  content: badOpen,
  chapterNumber: 7,
  prevChapterTail: prevTail,
  chapterOutline: outline,
})
if (!coldBad) throw new Error('无关开篇应判冷开篇')
if (/震慑宵小|保护妻子|人多势众|黑暗中磨刀/.test(coldBad.message)) {
  throw new Error(`缺失提示不应含欲望/阻碍/局面: ${coldBad.message}`)
}
if (!/撬门骚扰|本章起因/.test(coldBad.message)) {
  throw new Error(`缺失提示应指向起因: ${coldBad.message}`)
}

// 无标签大纲：只查第一条实质拍；后段拍点已写也不算过冷开篇硬门槛的「免检」
const slashOutline = '门外有人拍门叫骂 / 黑暗中磨刀威慑 / 对方知难而退 / 章末留下会否再来'
const slashGood = detectChapterSeamColdOpen({
  content: goodOpen,
  chapterNumber: 7,
  prevChapterTail: prevTail,
  chapterOutline: slashOutline,
})
if (slashGood) {
  throw new Error(`无标签起点拍已写仍冷开篇: ${slashGood.message}`)
}

const slashOnlyLater = `
屋里灯灭了。秦卫国未动声色，在门后把猎刀轻轻磨了两下，刀声细得像老鼠啃木头。
外面骂声顿住，骂骂咧咧退远了。苏婉缩在炕角。他心里想着对方会否再来。
`.repeat(4)
const slashCold = detectChapterSeamColdOpen({
  content: slashOnlyLater,
  chapterNumber: 7,
  prevChapterTail: prevTail,
  chapterOutline: slashOutline,
})
if (!slashCold) throw new Error('无标签大纲：只写后段拍、未写起点拍应冷开篇')
if (!/起点拍|拍门叫骂/.test(slashCold.message)) {
  throw new Error(`无标签缺失提示应指向起点拍: ${slashCold.message}`)
}
if (/知难而退|会否再来/.test(slashCold.message)) {
  throw new Error(`无标签不应把后段拍当硬门槛缺失: ${slashCold.message}`)
}

console.log('verify-cold-open-structural-beats OK')
