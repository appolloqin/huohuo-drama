/**
 * 本章结果态信息增量：同题金额字面须一致；已完结条不跨章续锁。
 * npx tsx scripts/verify-info-delta-locked-amount.ts
 */
import {
  collectLockedMoneyForInfoDelta,
  contentHasForeignLockedAmount,
  contentHasMoneyAmount,
  infoDeltaPointCoreAssertion,
  infoDeltaPointCovered,
  isInfoDeltaResultStatePoint,
  outlineInfoDeltaCovered,
} from '../src/services/novel/novel-outline-beat-cover.js'
import { buildInfoDeltaMustLandBlock } from '../src/services/novel/novel-chapter-emotion-beats.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'
import { detectAppealOpeningSellPoint } from '../src/services/novel/novel-commercial-appeal-audit.js'

const book = `
第1章：开篇
【恨】王德福把三年税银烂账拍在案上：“朝廷催银的文书今早又到了，连本带利两百四十两，三天内不交就查封。”
第4章：收网
【信息增量】补上了三年的欠了三年的税银。
`

const info = '黑风虎凝气巅峰，三五百人。令牌兵累计一千二百，兵力仍显单薄。补上了三年的欠了三年的税银。'
const ch4 = `第4章：收网
【信息增量】${info}
【恨】拍桌【爽】拿下【急】三日【盼】权柄
【本章起因】揭发【欲望】拿下【阻碍】辈分【局面变化】拒捕【人物选择】借刀【章末问题】号角？
`

const locked = collectLockedMoneyForInfoDelta(info, [book, ch4])
if (!locked.some(a => /二百四十|两百四十/.test(a))) {
  throw new Error(`本章含结算结果态时须锁两百四十两，got ${JSON.stringify(locked)}`)
}
if (!contentHasMoneyAmount('连本带利二百四十两银子', '两百四十两')) {
  throw new Error('二/两 须等价')
}
if (contentHasMoneyAmount('两百四十两', '四十两')) {
  throw new Error('四十两不得整段误命中两百四十两')
}

const settle = '补上了三年的欠了三年的税银'
const wrong =
  '秦德贵在旁边接了话：“三年没缴了，连本带息，拢共一百八十两。”秦默点了下头：“补上了。明日一早，把银子送镇妖司。”黑风虎凝气巅峰，手下三五百人。令牌兵累计一千二百，兵力仍显单薄。'
if (infoDeltaPointCovered(wrong, settle, { lockedAmounts: locked })) {
  throw new Error('一百八十两不得冒充已锁两百四十两')
}
if (!contentHasForeignLockedAmount(wrong, locked, settle)) {
  throw new Error('同题旁一百八十两须判为另造金额')
}
if (outlineInfoDeltaCovered(wrong, ch4, book)) {
  throw new Error('错金额稿不得整章信息增量覆盖')
}
const sellWrong = detectAppealOpeningSellPoint(wrong, 4, ch4, book)
if (!sellWrong || !/信息增量/.test(sellWrong)) {
  throw new Error(`吸引力审须拦错金额，got ${sellWrong}`)
}

const right =
  '秦默点头：三年税银连本带利两百四十两，昨夜已补交清，账上不再欠。黑风虎凝气巅峰，手下三五百人。令牌兵累计一千二百，首战在即兵力仍显单薄。'
if (!outlineInfoDeltaCovered(right, ch4, book)) {
  throw new Error('正确锁定额须覆盖')
}

const block = buildInfoDeltaMustLandBlock(info, locked)
if (!/已锁定钱数/.test(block) || !/二百四十|两百四十/.test(block)) {
  throw new Error(`须注入锁定钱数: ${block}`)
}

const pad = (s: string) => {
  let t = s
  while ([...t].length < 220) t += '补字。'
  return t
}
const report = detectOutlineCompliance({
  content: pad(wrong),
  chapterOutline: ch4,
  amountContext: book,
  chapterNumber: 4,
})
if (!report.reasons.some(r => r.code === 'info_delta_missing' && /二百四十|两百四十|锁/.test(r.message))) {
  throw new Error(`合规须点名锁定额，got ${JSON.stringify(report.reasons)}`)
}

// 第四章已写完结算条后：后续章信息增量不再含该条 → 不得续锁
const troopInfo = '秦默的令牌兵累计一千五百，首战告捷，但黑风寨未灭，妖域又露头。'
const chTroop = `第6章：首战
【信息增量】${troopInfo}
【恨】出征【爽】告捷【急】妖域【盼】再战
`
const troopLocked = collectLockedMoneyForInfoDelta(troopInfo, [book, chTroop])
if (troopLocked.length) {
  throw new Error(`后续章无结算结果态条时不得续锁，got ${JSON.stringify(troopLocked)}`)
}
const troopOk =
  '秦默点兵，令牌兵累计一千五百。首战告捷，黑风寨未灭，妖域又露头，众人不敢松气。'
if (!outlineInfoDeltaCovered(troopOk, chTroop, book)) {
  throw new Error('后续章兵力条场面化后须覆盖')
}
const troopReport = detectOutlineCompliance({
  content: pad('秦默出征，黑风寨未灭，妖域露头，众人不敢松气。'),
  chapterOutline: chTroop,
  amountContext: book,
  chapterNumber: 6,
})
const troopMiss = troopReport.reasons.find(r => r.code === 'info_delta_missing')
if (!troopMiss || /四十两|两百四十|已锁钱数|锁定钱数/.test(troopMiss.message)) {
  throw new Error(`后续章缺失不得夹杂已完结章锁银，got ${troopMiss?.message}`)
}

// 因由从句含「揭穿」≠ 本条结果态；不得锁杂额
const recruit =
  '周文远是黑风岭本地落魄书生，因秦默揭穿烂账、夜战土匪的举动主动投效'
if (isInfoDeltaResultStatePoint(recruit)) {
  throw new Error(`投效条不得因因由「揭穿」判结果态: core=${infoDeltaPointCoreAssertion(recruit)}`)
}
const recruitLocked = collectLockedMoneyForInfoDelta(recruit, [book, `【信息增量】${recruit}`])
if (recruitLocked.length) {
  throw new Error(`投效条不得锁四十两等杂额，got ${JSON.stringify(recruitLocked)}`)
}
const recruitOk =
  '周文远本是黑风岭落魄书生，见秦默揭穿烂账、夜战土匪，当晚主动投效门下。'
const chRecruit = `第7章：投效
【信息增量】${recruit}
【恨】冷眼【爽】投效【急】贼线【盼】用人
`
if (!outlineInfoDeltaCovered(recruitOk, chRecruit, book)) {
  throw new Error('投效条场面化后须覆盖（不因锁银失败）')
}

console.log('verify-info-delta-locked-amount OK', { locked, troopLocked, recruitLocked })
