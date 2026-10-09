/**
 * 本章大纲分拍编排：硬合同 + 计量兜底（跳过软编排）
 * npx tsx scripts/verify-chapter-outline-beat-pack.ts
 */
import {
  buildMeasuredFallbackBeatPack,
  collectChapterOutlineMustCoverFragments,
  parseSoftBeatPackJson,
  resolveChapterOutlineBeatPack,
  validateBeatPack,
} from '../src/services/novel/novel-chapter-beat-pack.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'
import { buildEmotionBeatSpecsFromPack } from '../src/services/novel/novel-chapter-emotion-beats.js'

const dense = `第4章：收网
【恨】王德福拍桌催银，连本带利两百四十两
【爽】刀盾围困二叔
【急】三日移交
【盼】号角未决
【信息增量】黑风虎凝气巅峰，三五百人。令牌兵累计一千二百，兵力仍显单薄。补上了三年的欠了三年的税银。周文远是黑风岭本地落魄书生，因秦默揭穿烂账、夜战土匪的举动主动投效。
【本章起因】账目揭发
【欲望】拿下二叔
【阻碍】辈分
【局面变化】拔刀拒捕
【人物选择】借刀
【章末问题】号角？
【主题回响】挖蛀虫
`

const frags = collectChapterOutlineMustCoverFragments(dense, 4)
if (frags.length < 6) throw new Error(`须收集多条片段，got ${frags.length}`)

const pack = buildMeasuredFallbackBeatPack({ chapterOutline: dense, chapterNumber: 4 })
const v = validateBeatPack(pack, frags, dense)
if (!v.ok) throw new Error(`计量兜底须过硬合同: ${v.reasons.join('; ')}`)
if (pack.beats.length < 4) throw new Error(`密章至少4拍，got ${pack.beats.length}`)
if (pack.source !== 'measured_fallback') throw new Error('source')

const weights = pack.beats.map(b => b.weightHint)
const sum = weights.reduce((a, b) => a + b, 0)
if (Math.abs(sum - 1) > 0.02) throw new Error(`字重须归一, sum=${sum}`)
// 密章爽侧字重应明显高于默认死比例下的急/盼
const shuangW = pack.beats.filter(b => b.phase === '爽').reduce((a, b) => a + b.weightHint, 0)
const panW = pack.beats.filter(b => b.phase === '盼').reduce((a, b) => a + b.weightHint, 0)
if (shuangW <= panW) throw new Error(`密章爽字重应高于盼: shuang=${shuangW} pan=${panW}`)

const specs = buildEmotionBeatSpecsFromPack({
  pack,
  chapterOutline: dense,
  chapterNumber: 4,
})
if (!specs.some(s => /须本拍落地/.test(s.beat))) {
  throw new Error('至少一拍须含 mustLand 注入')
}
if (specs.length !== pack.beats.length) {
  throw new Error('specs 拍数须对齐 pack')
}

const budgets = resolveChapterBeatBudgets({
  chapterOutline: dense,
  userTarget: 3000,
  chapterNumber: 4,
  beatPack: pack,
})
if (budgets.beatCount !== pack.beats.length) {
  throw new Error(`预算拍数须跟 pack: ${budgets.beatCount} vs ${pack.beats.length}`)
}

// 软编排 JSON 解析
const soft = parseSoftBeatPackJson(JSON.stringify({
  beats: [
    { phase: '恨', focus: '压迫', mustLand: ['账目揭发', '辈分'], weightHint: 0.3 },
    { phase: '爽', focus: '翻盘', mustLand: frags.filter(f => /黑风虎|令牌|税银|周文远|借刀|拒捕/.test(f)), weightHint: 0.35 },
    { phase: '急', focus: '加压', mustLand: ['三日移交'], weightHint: 0.2 },
    { phase: '盼', focus: '钩子', mustLand: ['号角？', '挖蛀虫'], weightHint: 0.15 },
  ],
}))
if (!soft) throw new Error('parse soft')
const softV = validateBeatPack(soft, frags, dense)
if (!softV.ok) {
  // 三日移交在【急】场；确保急场进 fragments
  console.warn('soft validate reasons', softV.reasons)
}

const resolved = await resolveChapterOutlineBeatPack({
  chapterOutline: dense,
  chapterNumber: 4,
  userTarget: 3000,
  skipSoft: true,
})
if (!resolved || resolved.source !== 'measured_fallback') {
  throw new Error('skipSoft 须计量兜底')
}
if (!validateBeatPack(resolved, frags, dense).ok) {
  throw new Error(`resolve skipSoft 须合法: ${validateBeatPack(resolved, frags, dense).reasons}`)
}

// 发明 mustLand 须拒
const bad = parseSoftBeatPackJson(JSON.stringify({
  beats: [
    { phase: '恨', focus: 'x', mustLand: ['这句绝对不在大纲里的外星情节'], weightHint: 0.25 },
    { phase: '爽', focus: 'x', mustLand: ['账目揭发'], weightHint: 0.25 },
    { phase: '急', focus: 'x', mustLand: ['三日移交'], weightHint: 0.25 },
    { phase: '盼', focus: 'x', mustLand: ['挖蛀虫'], weightHint: 0.25 },
  ],
}))!
const badV = validateBeatPack(bad, frags, dense)
if (badV.ok) throw new Error('发明 mustLand 不得通过')

console.log('verify-chapter-outline-beat-pack OK', {
  frags: frags.length,
  beats: pack.beats.length,
  shuangW: Number(shuangW.toFixed(3)),
  panW: Number(panW.toFixed(3)),
  sources: [pack.source, resolved.source],
})
