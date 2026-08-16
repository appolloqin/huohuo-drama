/**
 * npx tsx scripts/verify-outline-drama-fields.ts
 */
import {
  assertOutlineBookFields,
  assertOutlineChapterFields,
  buildChapterOutlineDramaPromptBlock,
  extractTagBlock,
  parseConflictLayers,
  resolveWritingChapterOutline,
  upgradePromptToDramaOutline,
} from '../src/services/novel/novel-outline-drama-fields.js'

const book = `【主题】命运可否改写
【世界规则】
- 成分论高压
- 饥饿真实
- 邻里舆论可伤人
- 能力不瞬发神功
【主角欲望·外】养活自己和媳妇
【主角欲望·内】不再重蹈前世窝囊
【主角弱点】隐忍过度
【人物核心】
- 秦卫国｜主角｜活下去｜苏婉｜自保
- 对手｜反派｜压制｜政绩｜保位置
【结局方向】苦乐参半｜蜕变：敢承担
【情绪调性】压抑、热血
`

const ch1 = `第1章：开局
【本章时间】深夜·慢
【本章地点】土屋炕上，寒气压人
【本章人物】秦卫国、苏婉
【本章起因】被发配到山沟断粮
【欲望】先填饱两口人肚子
【阻碍】米缸见底、邻里冷眼
【局面变化】从懵懂到决定明日进山
【人物选择】把最后糠饼分给媳妇
【冲突层】外部、自我
【情绪手法】胃抽、灯影、手攥被角
【章末问题】明天进山能否活着回来？
【信息增量】猎刀还在、仇人未至
【主题回响】改命从一口饭开始
【恨】邻里冷眼压在断粮土屋上，苏婉饿得发颤（对峙代价带出）
【爽】把最后糠饼塞给媳妇并撂一句「进山有路子」让邻里一愣
【急】明天进山能否活着回来？
【盼】猎刀还在；刀鞘内侧有人刻过记号留隐患
【爽型】硬撕
`

const ch2 = `第2章：闲话
【本章时间】同夜·快
【本章地点】屋里听墙外
【本章人物】秦卫国、苏婉、墙外邻家
【本章起因】墙外嘲笑资本家小姐
【欲望】按住怒火听清流言
【阻碍】舆论与成分标签
【局面变化】怒意压成行动计划
【人物选择】不冲出去对骂
【冲突层】人际
【情绪手法】月光、指节发白
【章末问题】明日如何破局？
【信息增量】邻里已定调羞辱
【主题回响】尊严被闲话撕开
【恨】墙外当众羞辱资本家小姐身份
【爽】按住怒火不冲出去，丢一句「闲话也有账」压成明日破局计划让邻里一顿
【急】明日如何破局尚无答案
【盼】已听清邻里定调；墙缝外还有第三个人脚步未现
【爽型】拒签
`

const full = `${book}\n${ch1}\n${ch2}`

const bookOk = assertOutlineBookFields(full)
if (!bookOk.ok) throw new Error(`book should pass: ${bookOk.missing.join(',')}`)

const noTheme = assertOutlineBookFields(full.replace('【主题】命运可否改写', ''))
if (noTheme.ok || !noTheme.missing.includes('主题')) throw new Error('missing theme')

const ch2ok = assertOutlineChapterFields(full, 2)
if (!ch2ok.ok || !ch2ok.fields) throw new Error(`ch2 should pass: ${ch2ok.missing}`)
if (!ch2ok.fields.hate || !ch2ok.fields.shuang || !ch2ok.fields.ji || !ch2ok.fields.pan) {
  throw new Error('ch2 emotion beats missing on fields')
}

const noHate = full.replace('【恨】墙外当众羞辱资本家小姐身份\n', '')
const ch2noHate = assertOutlineChapterFields(noHate, 2)
if (ch2noHate.ok || !ch2noHate.missing.includes('恨')) throw new Error('missing 恨')

const noDesire = full.replace('【欲望】按住怒火听清流言', '')
const ch2bad = assertOutlineChapterFields(noDesire, 2)
if (ch2bad.ok || !ch2bad.missing.includes('欲望')) throw new Error('missing desire')

const badLayer = parseConflictLayers('外部、随便')
if (!badLayer.invalid.includes('随便') || !badLayer.layers.includes('外部')) {
  throw new Error('conflict parse')
}

const dup = extractTagBlock('【欲望】甲\n【欲望】乙\n【阻碍】丙', '欲望')
if (dup !== '乙') throw new Error(`last tag got ${dup}`)

const block = buildChapterOutlineDramaPromptBlock(ch2ok.fields!)
if (!block.includes('本章大纲·戏剧要素')) throw new Error('prompt block')

const write = resolveWritingChapterOutline(full, 2, '旧一行概要')
if (write.source !== 'book_drama' || !/【欲望】/.test(write.text)) throw new Error('writing outline')

const upgraded = upgradePromptToDramaOutline({
  prompt: '精准击杀 / 设置简易陷阱，成功捕获两只肥美野兔。',
  oldChapterOutline: '精准击杀 / 设置简易陷阱，成功捕获两只肥美野兔。',
  writingChapterOutline: write.text,
})
if (!/【欲望】/.test(upgraded)) throw new Error('upgrade prompt')

console.log('verify-outline-drama-fields OK')
