/**
 * 结构作废时轻锚接缝开篇块
 * Run: npx tsx scripts/verify-forced-seam-opening.ts
 */
import { buildForcedSeamOpeningBlock } from '../src/services/novel/novel-chapter-seam.js'

const outline = '设置简易陷阱，成功捕获两只肥美野兔。 / 秦卫国熟练剥皮处理。 / 回程偶遇赵大彪。'
const block = buildForcedSeamOpeningBlock({
  chapterOutline: outline,
  prevTail: '他攥紧刀柄，对苏婉点了点头，推门走进夜色。',
})

if (!/开篇轻锚接缝/.test(block)) throw new Error('missing light-anchor seam header')
if (!/拍点1「设置简易陷阱/.test(block)) throw new Error('must embed outline beat 1')
if (!/轻锚/.test(block)) throw new Error('must require light-anchor continue')
if (!/已在途|离场状态|清晨离家/.test(block)) {
  throw new Error('must forbid leave-home cold open or continue from departed tip')
}
if (!/禁半句对白中起/.test(block)) throw new Error('must ban mid-dialogue cold start')

const noTail = buildForcedSeamOpeningBlock({ chapterOutline: outline, prevTail: '' })
if (!/从本章大纲拍点1起笔/.test(noTail)) throw new Error('no-tail path must start at beat 1')

console.log('PASS')
