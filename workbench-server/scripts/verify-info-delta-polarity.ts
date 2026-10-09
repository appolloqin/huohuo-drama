/**
 * 信息增量：逐条落地 + 结果态极性（题材无关；用例可含债税，但规则不绑场面词）
 * npx tsx scripts/verify-info-delta-polarity.ts
 */
import {
  buildInfoDeltaMustLandBlock,
  splitInfoDeltaPoints,
} from '../src/services/novel/novel-chapter-emotion-beats.js'
import {
  outlineInfoDeltaCovered,
  infoDeltaPointCovered,
  isInfoDeltaResultStatePoint,
} from '../src/services/novel/novel-outline-beat-cover.js'
import { detectAppealOpeningSellPoint } from '../src/services/novel/novel-commercial-appeal-audit.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'

// 用例 A：债税结果态（验证规则对「补上…」类结果态生效，非合同写死税银）
const deltaTax =
  '黑风寨寨主“黑风虎”是凝气巅峰的悍匪，手下三五百人，与秦德东勾结多年；秦默的令牌兵累计一千二百，但首战土匪寨在即，兵力仍显单薄。补上了三年的欠了三年的税银。'

// 用例 B：非债税结果态（揭穿类）——证明规则题材无关
const deltaExpose =
  '幕后金主是城南当铺掌柜；主角识破了假账，把伪契当场揭穿。'

const pointsTax = splitInfoDeltaPoints(deltaTax)
if (pointsTax.length < 3) throw new Error(`须拆出多条，got ${JSON.stringify(pointsTax)}`)
const taxPoint = pointsTax.find(p => isInfoDeltaResultStatePoint(p))
if (!taxPoint) throw new Error(`须含结果态要点: ${JSON.stringify(pointsTax)}`)

const exposePoint = splitInfoDeltaPoints(deltaExpose).find(p => isInfoDeltaResultStatePoint(p))
if (!exposePoint) throw new Error(`揭穿类须判结果态: ${deltaExpose}`)

const outlineTax = `第4章：二叔通匪
【恨】秦德东拍桌
【爽】刀盾围困
【急】三日移交
【盼】剿灭黑风寨
【信息增量】${deltaTax}
【主题回响】挖蛀虫
【本章起因】账目揭发
【欲望】拿下二叔
【阻碍】辈分
【局面变化】拔刀拒捕
【人物选择】借刀
【章末问题】号角
`

const unpaidOnly = `
偏厅里秦默对三叔说：“黑风岭三年，灾民少了三成，税银欠了两百四十两。二叔干这些事的时候，没想过秦家的脸面。”
黑风虎，凝气巅峰，手底下三五百条汉子，跟秦德东勾连了三年。拢共一千二百，兵力还薄得很。
`

if (outlineInfoDeltaCovered(unpaidOnly, outlineTax)) {
  throw new Error('仍写未结清旧态却无结果态 → 信息增量不得判已覆盖')
}
if (infoDeltaPointCovered(unpaidOnly, taxPoint!)) {
  throw new Error('结果态条：旧态句不得算已落地')
}

const sellMiss = detectAppealOpeningSellPoint(unpaidOnly, 4, outlineTax)
if (!sellMiss || !/信息增量/.test(sellMiss)) {
  throw new Error(`ch4 旧态稿须硬拦 opening_sell_point，got ${sellMiss}`)
}

const settled = `
偏厅里秦默对三叔说：“黑风岭三年税银，昨夜已补交清了两百四十两，账上不再欠朝廷。”
黑风虎，凝气巅峰，手底下三五百条汉子，跟秦德东勾连了三年。拢共一千二百，兵力还薄得很。
`

if (!outlineInfoDeltaCovered(settled, outlineTax)) {
  throw new Error('已写结果态 + 其余要点 → 须判覆盖')
}
if (!infoDeltaPointCovered(settled, taxPoint!)) {
  throw new Error('结果态条：完成标记须命中')
}

const sellOk = detectAppealOpeningSellPoint(settled, 4, outlineTax)
if (sellOk && /信息增量/.test(sellOk)) {
  throw new Error(`结果态完成稿不得再因信息增量硬拦: ${sellOk}`)
}

const block = buildInfoDeltaMustLandBlock(deltaTax)
if (!/结果态|已发生|未完成/.test(block)) {
  throw new Error(`须逐条落地块须含通用结果态极性: ${block}`)
}
if (/税银已补交|催债口径/.test(block)) {
  throw new Error(`生成块不得写死具体书情场面词: ${block}`)
}

// 揭穿类：未完成不得过；揭穿完成须过
const outlineExpose = `第2章：假账
【恨】掌柜逼契
【爽】当场对质
【急】三日封铺
【盼】谁撑腰
【信息增量】${deltaExpose}
【主题回响】假契
【本章起因】查账
【欲望】坐实伪契
【阻碍】衙役护短
【局面变化】掌柜变脸
【人物选择】亮伪契
【章末问题】金主是谁
`
const exposeMiss = '当铺里掌柜冷笑，假账摊在桌上，主角还没看穿。'
const exposeHit = '主角把伪契当场揭穿，城南当铺掌柜的幕后金主身份坐实了。'
if (infoDeltaPointCovered(exposeMiss, exposePoint!)) {
  throw new Error('揭穿类：未完成不得算落地')
}
if (!infoDeltaPointCovered(exposeHit, exposePoint!)) {
  throw new Error('揭穿类：结果态须命中')
}
if (!outlineInfoDeltaCovered(exposeHit, outlineExpose)) {
  throw new Error('揭穿类整章信息增量须覆盖')
}

// 第6章也须拦信息增量（不只前五章卖点窗）
const lateMiss = detectAppealOpeningSellPoint(unpaidOnly, 6, outlineTax)
if (!lateMiss || !/信息增量/.test(lateMiss)) {
  throw new Error(`ch6 亦须拦未兑现信息增量，got ${lateMiss}`)
}

const pad = (s: string) => (s + '补字。'.repeat(40)).slice(0, Math.max(220, [...s].length))
const complianceMiss = detectOutlineCompliance({
  content: pad(unpaidOnly),
  chapterOutline: outlineTax,
  chapterNumber: 4,
})
if (complianceMiss.ok || !complianceMiss.reasons.some(r => r.code === 'info_delta_missing')) {
  throw new Error(`大纲合规须报 info_delta_missing，got ${JSON.stringify(complianceMiss.reasons)}`)
}
const complianceOk = detectOutlineCompliance({
  content: pad(settled),
  chapterOutline: outlineTax,
  chapterNumber: 4,
})
if (complianceOk.reasons.some(r => r.code === 'info_delta_missing')) {
  throw new Error(`结果态完成稿不得再报 info_delta_missing`)
}

console.log('verify-info-delta-polarity OK', {
  taxPoint,
  exposePoint,
  sellMiss: sellMiss.slice(0, 60),
})
