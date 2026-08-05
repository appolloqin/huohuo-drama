/**
 * npx tsx scripts/verify-chapter-beat-budget.ts
 */
import { resolveChapterBeatBudgets, beatWeightTemplate } from '../src/services/novel/novel-chapter-beat-budget.js'
import {
  extractOutlineBeatPhrases,
  extractOutlineCatalystPhrases,
  buildOutlineStaleBlock,
} from '../src/services/novel/novel-chapter-seam.js'
import { pruneBriefToOutlineBeats } from '../src/services/novel/novel-outline-boundary.js'

const w3 = beatWeightTemplate(3)
if (Math.abs(w3.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error('w3 sum')

const outline = '环顾四周家徒四壁米缸见底 / 邻居墙外指指点点嘲笑资本家小姐 / 秦卫国眼神变冷握紧拳头决定不再重蹈前世覆辙'
const r = resolveChapterBeatBudgets({
  chapterOutline: outline,
  userTarget: 2800,
  endpointPending: true,
})
if (r.beatCount !== 3) throw new Error(`beats ${r.beatCount}`)
const sum = r.items.reduce((a, it) => a + it.targetChars, 0)
if (sum !== 2800) throw new Error(`sum ${sum}`)
if (!r.promptBlock.includes('篇幅预算')) throw new Error('no block')
if (!r.promptBlock.includes('0 字')) throw new Error('no zero after last')
if (r.items[2]!.phase !== '收束') throw new Error('last phase')

const one = resolveChapterBeatBudgets({
  chapterOutline: '他决定改变命运从此不同',
  userTarget: 1200,
  endpointPending: true,
})
if (one.beatCount !== 1 || one.items[0]!.targetChars !== 1200) {
  throw new Error('single beat')
}

/** 题材 A：山野（仅作样例，断言不依赖场面词表） */
const dramaHunt = `第5章
【本章时间】同日下午
【本章地点】回程小路
【本章人物】甲、乙
【本章起因】陷阱成功捕获野兔
【欲望】安全带猎物回家
【阻碍】回程偶遇挑衅
【局面变化】冷漠无视避免升级
【人物选择】不与小人计较
【冲突层】人际
【情绪手法】沉稳压抑
【章末问题】挑衅会否变本加厉？
【信息增量】反派形象与克制
【主题回响】不和苍蝇论长短`

/** 题材 B：都市职场（证明标签语义跨题材） */
const dramaOffice = `第3章
【本章时间】周一上午
【本章地点】公司会议室
【本章人物】林晚、总监
【本章起因】方案已在晨会通过
【欲望】守住项目主导权
【阻碍】总监当众改口抽走预算
【局面变化】从稳拿变成要抢回话语权
【人物选择】当场摊数据而不是忍气
【冲突层】人际、外部
【情绪手法】克制里的锋利
【章末问题】晚间酒局还去不去？
【信息增量】预算被抽的真因未说破
【主题回响】规则不认情面`

function assertDramaBeats(label: string, drama: string, desireNeedle: string, catalystNeedle: string) {
  const beats = extractOutlineBeatPhrases(drama)
  if (beats.length < 5) throw new Error(`${label} beats too few: ${JSON.stringify(beats)}`)
  if (!beats.some(b => b.includes(desireNeedle))) throw new Error(`${label} missing desire`)
  // 起因未在前序落地时，须进入拍点序列（否则会跳过击杀/通过等过程）
  if (!beats.some(b => b.includes(catalystNeedle))) {
    throw new Error(`${label} catalyst must be plot beat when pending: ${JSON.stringify(beats)}`)
  }
  if (beats[0] && !beats[0].includes(catalystNeedle)) {
    throw new Error(`${label} catalyst should be first plot beat, got ${beats[0]}`)
  }
  const catalysts = extractOutlineCatalystPhrases(drama)
  if (!catalysts.some(c => c.includes(catalystNeedle))) {
    throw new Error(`${label} catalyst extract failed`)
  }
  // 前序未覆盖起因 → 须写过程提示，而非一律禁演
  const pending = buildOutlineStaleBlock({
    chapterOutline: drama,
    prevTail: '上一章在完全无关的场景里收束，只留下一句未完成的话。',
    chapterNumber: 3,
  })
  if (!pending.includes('前序尚未落地') || !pending.includes(catalystNeedle)) {
    throw new Error(`${label} pending catalyst block missing: ${pending.slice(0, 240)}`)
  }
  // 前序已写到起因全文 → 禁演过程
  const fullCatalyst = catalysts.find(c => c.includes(catalystNeedle)) || catalystNeedle
  const covered = buildOutlineStaleBlock({
    chapterOutline: drama,
    prevTail: `前文已经交代清楚：${fullCatalyst}。众人散去。`,
    chapterNumber: 3,
  })
  if (!covered.includes('禁止再写') || !covered.includes(catalystNeedle)) {
    throw new Error(`${label} covered catalyst must forbid replay: ${covered.slice(0, 240)}`)
  }
  if (covered.includes('前序尚未落地')) {
    throw new Error(`${label} covered must not say pending`)
  }
  return beats
}

assertDramaBeats('hunt', dramaHunt, '安全带猎物', '陷阱成功')
assertDramaBeats('office', dramaOffice, '主导权', '方案已在晨会')

const brief = `【结构以本章大纲为准 — 开篇不得早于上章末已发生事实；写作说明结构段作废】\n${dramaOffice}`
const pruned = pruneBriefToOutlineBeats(brief, dramaOffice)
if (!/【局面变化】/.test(pruned.brief)) throw new Error('prune dropped stakesShift')
if (!/【人物选择】/.test(pruned.brief)) throw new Error('prune dropped choice')
if (/【结构以本章大纲为准/.test(pruned.brief)) throw new Error('structure prefix should strip')

const dramaBudget = resolveChapterBeatBudgets({
  chapterOutline: dramaOffice,
  userTarget: 2800,
  endpointPending: false,
})
if (dramaBudget.beatCount < 5) throw new Error(`drama budget beats ${dramaBudget.beatCount}`)
if (dramaBudget.promptBlock.includes('拍点不足')) throw new Error('should not say insufficient beats')

console.log('verify-chapter-beat-budget OK', {
  phases: r.items.map(i => `${i.phase}:${i.targetChars}`),
  officeBeats: extractOutlineBeatPhrases(dramaOffice),
  dramaBudgetCount: dramaBudget.beatCount,
})
