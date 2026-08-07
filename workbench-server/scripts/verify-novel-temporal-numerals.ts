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

const lunarOmitDay = normalizeNovelTemporalNumerals(
  '墙上挂着的日历只剩半截，上面印着“1966”几个褪色的红字，旁边是手写的“农历11月十七”。',
)
if (!lunarOmitDay.includes('农历11月17') || lunarOmitDay.includes('十七')) {
  throw new Error(`农历省略日应数字化: ${lunarOmitDay}`)
}

if (!normalizeNovelTemporalNumerals('十二月初三').includes('12月3')) {
  throw new Error('十二月初三 → 12月3')
}

const durationSafe = normalizeNovelTemporalNumerals('折腾了一个月十七天。')
if (durationSafe.includes('1月17') || !durationSafe.includes('十七天')) {
  throw new Error(`时长「十七天」勿当日期: ${durationSafe}`)
}

const idiomHour = normalizeNovelTemporalNumerals(
  '跑就跑了吧。这畜生惊了这一回，一时半会儿不会再走这条道。一时半刻也别指望。一时兴起就算了。',
)
if (idiomHour.includes('1时')) {
  throw new Error(`一时半会儿等不得改钟点: ${idiomHour}`)
}
if (!idiomHour.includes('一时半会儿') || !idiomHour.includes('一时半刻') || !idiomHour.includes('一时兴起')) {
  throw new Error(`应保留一时成语: ${idiomHour}`)
}

const realShi = normalizeNovelTemporalNumerals('凌晨三时出发，下午四时收工。')
if (!realShi.includes('凌晨3时') || !realShi.includes('下午4时')) {
  throw new Error(`真钟点「时」应转换: ${realShi}`)
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
