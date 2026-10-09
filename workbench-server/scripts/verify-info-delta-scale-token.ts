/**
 * 信息增量量词：一千二百等须字面强制；专修路径依赖此判定。
 * npx tsx scripts/verify-info-delta-scale-token.ts
 */
import {
  extractScaleAmountTokensLite,
  infoDeltaPointCovered,
  outlineInfoDeltaCovered,
} from '../src/services/novel/novel-outline-beat-cover.js'

const point = '秦默的令牌兵累计一千二百，但首战土匪寨在即，兵力仍显单薄'
const tokens = extractScaleAmountTokensLite(point)
if (!tokens.includes('一千二百')) {
  throw new Error(`须抽出一千二百，got ${JSON.stringify(tokens)}`)
}

const miss = '黑风虎是凝气巅峰悍匪，手下三五百人，与二叔勾结多年。厅里对峙升级。'
if (infoDeltaPointCovered(miss, point)) {
  throw new Error('无一千二百不得判兵力条落地')
}

const hit = '他掌心令牌微烫，后山令牌兵累计一千二百，首战在即，兵力仍显单薄。'
if (!infoDeltaPointCovered(hit, point)) {
  throw new Error('有一千二百+兵力单薄须判落地')
}

const outline = `第1章：x
【信息增量】黑风虎凝气巅峰，三五百人。${point}。补上了三年的欠了三年的税银。
【恨】a【爽】b【急】c【盼】d
【本章起因】e【欲望】f【阻碍】g【局面变化】h【人物选择】i【章末问题】j
`
const fullMiss = hit + '黑风虎凝气巅峰，手下三五百人。'
if (outlineInfoDeltaCovered(fullMiss, outline)) {
  throw new Error('缺税银结果态不得整章覆盖')
}
const fullHit = fullMiss + '三年税银昨夜已补交清，账上不再欠。'
if (!outlineInfoDeltaCovered(fullHit, outline)) {
  throw new Error('三条齐须覆盖')
}

console.log('verify-info-delta-scale-token OK', { tokens })
