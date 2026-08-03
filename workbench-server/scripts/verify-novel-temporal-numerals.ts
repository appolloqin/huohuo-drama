/**
 * npx tsx scripts/verify-novel-temporal-numerals.ts
 */
import {
  normalizeNovelTemporalNumerals,
  stripNovelAsteriskSceneBreaks,
} from '../src/common/novel/novel-temporal-numerals.js'

const soup = normalizeNovelTemporalNumerals('秦卫国把最后一点汤底倒进搪瓷缸里，想了想。')
if (soup.includes('1点')) throw new Error(`一点汤不得改成1点: ${soup}`)
if (!soup.includes('一点汤底')) throw new Error(`应保留一点: ${soup}`)

const clock = normalizeNovelTemporalNumerals('凌晨三点他才睡。下午两点半出门。三点钟集合。')
if (!clock.includes('凌晨3点') || !clock.includes('下午2点半') || !clock.includes('3点钟')) {
  throw new Error(`钟点应转换: ${clock}`)
}

const bareThree = normalizeNovelTemporalNumerals('三点出发去林场。')
if (!bareThree.includes('3点出发')) throw new Error(`裸三点可转: ${bareThree}`)

const yearMoney = normalizeNovelTemporalNumerals('一九九零年花了八百元。')
if (!yearMoney.includes('1990年') || !yearMoney.includes('800元')) {
  throw new Error(`年月金额: ${yearMoney}`)
}

const stars = normalizeNovelTemporalNumerals(
  '门关得很响。\n\n* * *屋里头，酒过三巡。\n\n他坐下。',
)
if (/\*/.test(stars)) throw new Error(`应去掉星号: ${stars}`)
if (!stars.includes('屋里头')) throw new Error(`正文应保留: ${stars}`)

const lineStars = stripNovelAsteriskSceneBreaks('上一段\n***\n下一段')
if (/\*/.test(lineStars) || !lineStars.includes('下一段')) {
  throw new Error(`独立***行应剥: ${lineStars}`)
}

console.log('verify-novel-temporal-numerals OK')
