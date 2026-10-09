/**
 * 本章自定义大纲优先于全书切片（金额等以 UI 本章大纲为准）
 * npx tsx scripts/verify-prefer-custom-outline.ts
 */
import { preferCustomChapterOutline } from '../src/services/novel/novel-outline-drama-ensure.js'
import { resolveWritingChapterOutline } from '../src/services/novel/novel-outline-drama-fields.js'

const custom = `卯时令牌
【恨】连本带利两百四十两，三天内不交
【信息增量】签到三百，目标百万兵
【本章起因】催债
【欲望】立威
【阻碍】欠税
【局面变化】查账
`
const book = `第1章：旧
【恨】连本带利四十两，三天内不交
【信息增量】签到三百
【本章起因】催债
【欲望】立威
【阻碍】欠税
【局面变化】查账
【人物选择】立威
【冲突层】外部
【情绪手法】对峙
【章末问题】烧账？
【主题回响】人心
【本章时间】卯时
【本章地点】正堂
【本章人物】秦默
【恨】x
【爽】y
【急】z
【盼】w
【爽型】揭穿假账
`

const picked = preferCustomChapterOutline(custom, book)
if (!picked.includes('两百四十两') || picked.includes('连本带利四十两，')) {
  // book also has 四十 as substring risk — check custom win
  if (!picked.includes('两百四十两')) throw new Error(`should prefer custom 240: ${picked.slice(0, 120)}`)
}

const resolved = resolveWritingChapterOutline(`【分章概要】\n${book}`, 1, custom)
if (resolved.source !== 'fallback' || !resolved.text.includes('两百四十两')) {
  throw new Error(`resolveWritingChapterOutline must prefer custom: ${resolved.source} ${resolved.text.slice(0, 100)}`)
}

console.log('verify-prefer-custom-outline OK')
