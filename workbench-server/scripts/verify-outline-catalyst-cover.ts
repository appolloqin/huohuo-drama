/**
 * 【本章起因】不得仅因物体名词误判已落地；糠皮盘点由起因落实类规则拦。
 * npx tsx scripts/verify-outline-catalyst-cover.ts
 */
import { outlineCatalystCoveredIn } from '../src/services/novel/novel-outline-beat-cover.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'

const catalyst = '苏婉拿出藏着的半块糠饼想给秦卫国吃'

const crumbOpen = `炕沿边那双手松开时，指缝里还夹着几粒糠皮。
秦卫国把空了的半块饼塞回炕头那只缺口的搪瓷缸里，缸子磕在土墙上闷响了一声。
他没动，就着这点灯光，把这间不到十平米的屋子从头到尾扫遍。北墙根一口半人高的空缸。`

if (outlineCatalystCoveredIn(crumbOpen, catalyst)) {
  throw new Error('糠皮开篇不得判本章起因已落地')
}

const realOffer = `煤油灯芯拨得太低。苏婉缓慢地把右手伸进贴身单衣里头，掏出一小块东西。
那半块糠饼在苏婉手心里攥着，指节泛白，像是攥着什么金贵物件。她想给秦卫国吃。`

if (!outlineCatalystCoveredIn(realOffer, catalyst)) {
  throw new Error(`苏婉拿出糠饼应判落地: ${realOffer.slice(0, 40)}`)
}

const outline = `第3章：第一顿饱饭
【本章起因】苏婉拿出藏着的半块糠饼想给秦卫国吃
【欲望】让妻子不再挨饿
【阻碍】家中无余粮，外部狩猎有风险
【局面变化】秦卫国拒绝糠饼，决定进山
【人物选择】翻出锈猎刀，准备进山碰运气`

const crumbFull = (crumbOpen + '\n\n这就是全部家当。胃里又翻上一股饿。四条路，归根结底一条——先吃饱。').repeat(3)
const r = detectOutlineCompliance({
  content: crumbFull,
  chapterNumber: 3,
  chapterOutline: outline,
  prevChapterTail: '秦卫国握紧拳头，决定从零开始。邻居的嘲讽还在耳边。如何解决第一顿饱饭的问题？',
})
const codes = new Set(r.reasons.map(x => x.code))
if (!codes.has('early_beats_missing') && !codes.has('catalyst_agency_fail')) {
  throw new Error(`糠皮盘点应由起因落实类规则拦住, got ${[...codes]}`)
}

console.log('verify-outline-catalyst-cover OK')
