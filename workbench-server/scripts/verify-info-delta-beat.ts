/**
 * 信息增量须拆成逐条必写（禁止只抄「三百」半句）
 * npx tsx scripts/verify-info-delta-beat.ts
 */
import {
  buildEmotionBeatSpecs,
  buildInfoDeltaMustLandBlock,
  splitInfoDeltaPoints,
} from '../src/services/novel/novel-chapter-emotion-beats.js'

const delta =
  '掌中玄铁令牌在卯时微微一烫，秦默瞥见令牌表面浮出一行小字：“签到第一日，得刀盾手三百。”——书名卖点“百万兵”今日只兑现三百刀盾手，但令牌规则已明：每日卯时签到出兵，日积月累，目标仍是百万雄师。'

const points = splitInfoDeltaPoints(delta)
if (points.length < 2) throw new Error(`须拆出至少2点，got ${JSON.stringify(points)}`)
if (!points.some(p => p.includes('三百')) || !points.some(p => p.includes('百万'))) {
  throw new Error(`须同时含三百与百万要点: ${JSON.stringify(points)}`)
}

const block = buildInfoDeltaMustLandBlock(delta)
if (!block.includes('须逐条落地') || !block.includes('1.') || !block.includes('2.')) {
  throw new Error(`block 须编号: ${block}`)
}

const outline = `第1章：烂摊子
【恨】使者逼债
【爽】拔剑立威
【急】五日交粮
【盼】缺粮
【信息增量】${delta}
【主题回响】权在粮
【本章起因】使者上门
【欲望】保住领主位
【阻碍】粮仓见底
【局面变化】查账
【人物选择】拒交人质
【章末问题】明日粮车
`
const specs = buildEmotionBeatSpecs({ chapterOutline: outline, chapterNumber: 1 })
const shuang = specs.find(s => s.phase === '爽')?.beat || ''
if (!shuang.includes('须逐条落地') || !shuang.includes('百万雄师')) {
  throw new Error(`爽拍须含拆条信息增量: ${shuang.slice(0, 400)}`)
}
const hate = specs.find(s => s.phase === '恨')?.beat || ''
if (!hate.includes('本章必写') || !hate.includes('百万')) {
  throw new Error(`恨拍须含信息增量本章必写+百万要点: ${hate.slice(0, 300)}`)
}

console.log('verify-info-delta-beat OK', { points })
