/**
 * 章末问题：正文落到钩子事件（未回答「是要A还是B/能否」）不得判揭晓。
 * 中段口语「终于」不得触发抽象完成误杀。
 * npx tsx scripts/verify-suspense-ending-hook-not-resolved.ts
 */
import { detectSuspenseEndingResolved } from '../src/services/novel/novel-outline-compliance.js'
import {
  outlineInfoDeltaCovered,
  infoDeltaPointCovered,
  splitInfoDeltaPointsForCover,
} from '../src/services/novel/novel-outline-beat-cover.js'

const outline = `第4章：收网
【恨】对峙拍桌掀翻茶盏
【爽】刀盾手涌入当场拿下
【急】宣判三日后移交官署
【盼】秦默拿下二叔，族中再无人掣肘，权柄归他——只差下一仗让旧部信服。
【章末问题】山外号角响起，来人是要劫走二叔还是要屠了镇子？守军能否挡住三五百悍匪？
【信息增量】寨主是凝气悍匪，手下三五百人；令牌兵累计一千二百。补上了三年的欠税。
【本章起因】账目揭发通匪
【欲望】堂堂正正拿下二叔
【阻碍】族中辈分压人
【局面变化】拔刀拒捕被围
【人物选择】借账房当众揭发
【主题回响】挖掉蛀虫
`

const unitOk = `
偏厅里对峙升级。账房摔出账目，族老拍桌怒骂。主角端坐宣判通匪，刀盾手涌入拿下二叔，关入私牢，三日后移交。
秦德东脸上的笑终于挂不住了，被人拖出去。族中再无人掣肘，权柄归他，只差下一仗让旧部信服。
窗外忽然传来号角，山外号角一声接一声响起。厅里的人都抬起头听着。
`
const okProse = (unitOk + '\n').repeat(6)

const unitBad = `
偏厅拿下二叔，关入私牢。号角响起后，悍匪连夜来袭专为劫走二叔，守军成功挡住了三五百人，土匪溃逃，镇子保住了。
`
const badProse = (unitBad + '\n').repeat(8)

const okHit = detectSuspenseEndingResolved({ content: okProse, chapterOutline: outline })
if (okHit) {
  throw new Error(`钩子未揭晓不得硬拦: ${okHit.message}`)
}

const badHit = detectSuspenseEndingResolved({ content: badProse, chapterOutline: outline })
if (!badHit) {
  throw new Error('已揭晓劫走+挡住成功须硬拦')
}

// 信息增量极性（与悬念正交）：未完成句不得算结果态落地
const info = '寨主是凝气悍匪，手下三五百人；令牌兵累计一千二百。补上了三年的欠税。'
const settle = splitInfoDeltaPointsForCover(info).find(p => /补上|欠税/.test(p))!
const deferred = '那三年的税银，你另立个册子，明早送到书房。寨主凝气悍匪，手下三五百人。令牌兵累计一千二百。'
if (infoDeltaPointCovered(deferred, settle)) {
  throw new Error('改日再办不得算结果态信息增量落地')
}
const settled = '昨夜已补交清三年欠税，账上不再欠。寨主凝气悍匪，手下三五百人。令牌兵累计一千二百，兵力仍薄。'
if (!outlineInfoDeltaCovered(settled, `【信息增量】${info}`)) {
  throw new Error('结果态完成须判信息增量覆盖')
}

console.log('verify-suspense-ending-hook-not-resolved OK', { bad: badHit.message.slice(0, 60) })
