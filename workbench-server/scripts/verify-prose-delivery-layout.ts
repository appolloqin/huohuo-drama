/**
 * 正文交付契约：引号成对 + 禁止文字墙（方案 B）
 * npx tsx scripts/verify-prose-delivery-layout.ts
 */
import {
  assertNovelProseLayoutContract,
  enforceNovelProseDeliveryLayout,
  needsParagraphSplit,
} from '../src/common/novel/novel-paragraph-format.js'
import { repairUnbalancedDialogueQuotes } from '../src/common/novel/novel-dialogue-quotes.js'

const stuckOpen = (
  '孙守仁又开口了：“额主大人，老朽知道您年轻。'
  + '林默盯着他。手心里那枚玄铁令牌硌得生疼。前主人的死讯还在耳边回响。'
  + '账房摊开的烂账像一张网。他霍地拔出锈蚀的长剑。剑尖直指孙守仁胸口。'
  + '期限我定。五日之内粮草军饷我一分不少。拿不出来这剑先借你的人头祭旗。'
  + '堂下一片死寂。孙守仁脸色煞白。林默忽然听见脑子里嗡的一声。'
  + '一行字浮现：今日可签：刀盾手三百。他眯起眼，把令牌往案上一拍。'
).repeat(5)

// 源头：先修引号，再排版；不得依赖「容忍坏引号硬拆」
const repaired = repairUnbalancedDialogueQuotes(stuckOpen)
if ((repaired.match(/“/g) || []).length !== (repaired.match(/”/g) || []).length) {
  throw new Error('repairUnbalancedDialogueQuotes must balance curly quotes')
}

const delivered = enforceNovelProseDeliveryLayout(stuckOpen)
const gate = assertNovelProseLayoutContract(delivered)
if (!gate.ok) {
  throw new Error(`delivery layout contract failed: ${gate.reasons.join('; ')}`)
}
if (needsParagraphSplit(delivered)) {
  throw new Error('delivered prose must not still need paragraph split')
}
const paras = delivered.split(/\n\n+/).filter(Boolean)
if (paras.length < 4) {
  throw new Error(`delivery must produce short paras, got ${paras.length}`)
}
if (paras.some(p => p.length > 420)) {
  throw new Error(`delivery left a wall paragraph (${Math.max(...paras.map(p => p.length))} chars)`)
}

// 已合格短段不得被拆成诗化碎行
const ok = [
  '“三日之内交不出军粮，兵权收回！”使者把通牒拍在案上。',
  '',
  '林默拔剑立威：“期限我定。”',
  '',
  '堂下一片死寂。',
].join('\n')
const kept = enforceNovelProseDeliveryLayout(ok)
if (!assertNovelProseLayoutContract(kept).ok) {
  throw new Error('already-good prose must pass contract')
}
if (!/拔剑立威/.test(kept)) {
  throw new Error('delivery must keep plot text')
}

console.log('verify-prose-delivery-layout OK', { paras: paras.length })
