/**
 * 书名卖点 ↔ 大纲/正文对齐（题材无关：第1章须交代书名硬钩/量级）
 * npx tsx scripts/verify-title-sell-align.ts
 */
import {
  assertChapterTitleSellAlignment,
  assertOutlineTitleSellAlignment,
  buildChapterTitleSellHardRequirement,
  extractTitleSellHooks,
  titleMagnitudeAmount,
} from '../src/services/novel/novel-title-sell-align.js'

const title = '穿越古代当领主：开局签到百万兵'
const hooks = extractTitleSellHooks(title)
if (!hooks.includes('百万兵') || !hooks.includes('开局签到百万兵')) {
  throw new Error(`hooks must include 开局签到百万兵 and 百万兵, got ${JSON.stringify(hooks)}`)
}
if (titleMagnitudeAmount('百万兵') !== '百万') {
  throw new Error(`titleMagnitudeAmount(百万兵) must be 百万`)
}

const badOutline = `
【世界观设定】
- 时代背景：大周
【总纲】穿越当领主
【卖点偏转】常见领主种田 → 本书靠签到扩军
【非常规压力源】王府逼交军粮
【能力非常规用法】签到兵力
【分卷设计】
- 第一卷（第1～30章）
【分章概要】
第1章：醒来就是烂摊子
【恨】使者逼债
【爽】拔剑立威
【急】五日交粮
【盼】缺粮草
【信息增量】今日可签：刀盾手三百
【章末问题】三百人够不够
`

const bad = assertOutlineTitleSellAlignment(badOutline, title)
if (bad.ok) throw new Error('outline with partial qty only must fail title sell (missing title magnitude)')

const goodOutline = badOutline
  .replace(
    '【信息增量】今日可签：刀盾手三百',
    '【信息增量】系统开局签到：首日到账刀盾手三百，累计目标百万兵；差的是粮草与编制',
  )
  .replace(
    '【盼】缺粮草',
    '【盼】缺粮草养不住签到兵力，百万兵目标差一环编制',
  )

const good = assertOutlineTitleSellAlignment(goodOutline, title)
if (!good.ok) {
  throw new Error(`aligned outline must pass: ${good.reasons.join('; ')}`)
}

/** 总纲写量级、第1章只写小数额 → 必须失败 */
const deferredOutline = `
【世界观设定】
- 时代背景：大周
【总纲】穿越当领主，终局签到百万兵
【卖点偏转】常见领主种田 → 本书靠签到扩军至百万兵
【非常规压力源】王府逼交军粮
【能力非常规用法】签到兵力
【分卷设计】
- 第一卷（第1～30章）
【分章概要】
第1章：醒来就是烂摊子
【恨】使者逼债
【爽】拔剑立威
【急】五日交粮
【盼】缺粮草
【信息增量】今日可签：刀盾手三百
【章末问题】三百人够不够
`
const deferred = assertOutlineTitleSellAlignment(deferredOutline, title)
if (deferred.ok) {
  throw new Error('outline with magnitude only in 总纲 (ch1=other qty) must fail')
}

/** 另一题材：量级钩仍须第1章字面数词 */
const wealthTitle = '重生商业帝国：开局十亿启动金'
const wealthBad = `
【总纲】重生搞钱
【卖点偏转】常见打脸 → 本书靠启动金撬局
【非常规压力源】股东逼宫
【能力非常规用法】先知行情
【分章概要】
第1章：会议室摊牌
【盼】缺钱
【信息增量】账户只剩三万周转
`
if (assertOutlineTitleSellAlignment(wealthBad, wealthTitle).ok) {
  throw new Error('wealth title with 三万 only must fail')
}
const wealthGood = wealthBad.replace(
  '【信息增量】账户只剩三万周转',
  '【信息增量】表面账户三万，账本目标是十亿启动金',
).replace('【盼】缺钱', '【盼】三万撑不住，十亿启动金差临门一脚')
if (!assertOutlineTitleSellAlignment(wealthGood, wealthTitle).ok) {
  throw new Error('wealth title with 十亿 in ch1 must pass')
}

const badCh1 = `
催税文书拍在案上。秦默睁眼，三百刀盾手列在府前。
卯时一到，系统到账，这三百人是他签出来的。
他收了账本，说三天之内让他们认我。
`.repeat(3)
const badBody = assertChapterTitleSellAlignment(badCh1, title, undefined, 1)
if (badBody.ok) {
  throw new Error('ch1 with other qty only (no title magnitude) must fail')
}
// 硬闸：即使无「其他数额」启发式，缺字面「百万」也必须失败
const noQtyNoMag = '秦默睁眼，令牌微烫，他想起了父亲留下的封地。'.repeat(8)
if (assertChapterTitleSellAlignment(noQtyNoMag, title, undefined, 1).ok) {
  throw new Error('ch1 without literal 百万 must fail even without other qty')
}

const goodCh1 = badCh1.replace(
  '这三百人是他签出来的。',
  '这三百人是他签出来的。他心里清楚：账本按百万兵目标滚，今日只是开局第一笔。',
)
const goodBody = assertChapterTitleSellAlignment(goodCh1, title, undefined, 1)
if (!goodBody.ok) {
  throw new Error(`ch1 with title magnitude target must pass: ${goodBody.reasons.join('; ')}`)
}

const ch2Skip = assertChapterTitleSellAlignment(badCh1, title, undefined, 2)
if (!ch2Skip.ok) throw new Error('chapter 2 must skip title-sell body gate')

const hard = buildChapterTitleSellHardRequirement(title, undefined, 1)
if (!hard.includes('写引导') || !hard.includes('百万')) {
  throw new Error(`ch1 write guide must pin magnitude amount, got: ${hard}`)
}
if (buildChapterTitleSellHardRequirement(title, undefined, 3)) {
  throw new Error('ch3 must not inject title-sell hard contract')
}

console.log('verify-title-sell-align OK', { hooks, wealthHooks: extractTitleSellHooks(wealthTitle) })
