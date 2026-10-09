/**
 * npx tsx scripts/verify-beat-write-contract.ts
 */
import {
  beatMustLandInfoDeltaCovered,
  buildBeatWriteContractBlock,
  buildChapterInfoDeltaDispatchNote,
  parseMustLandFromBeatText,
} from '../src/services/novel/novel-chapter-beat-write-contract.js'
import { mapOutlineBoundaryModelViolations } from '../src/services/novel/novel-outline-boundary-audit.js'

const beatText = [
  '【爽】翻盘',
  '【须本拍落地·大纲原文】',
  '1. 令牌累计十万兵，反噬倒计时正式启动',
  '2. 北狄拓跋烈犯边，第二卷主敌登场',
  '以上 mustLand 须场面化',
].join('\n')

const parsed = parseMustLandFromBeatText(beatText)
if (parsed.length !== 2) throw new Error(`parse mustLand got ${JSON.stringify(parsed)}`)
if (!parsed[0]!.includes('十万兵')) throw new Error('parse first point')

const outline = [
  '【本章起因】卯时签到出兵',
  '【信息增量】令牌累计十万兵，反噬倒计时正式启动；北狄拓跋烈犯边，第二卷主敌登场。',
].join('\n')

const note = buildChapterInfoDeltaDispatchNote(outline)
if (!note.includes('分拍落地')) throw new Error('dispatch note missing')
if (note.includes('须逐条落地')) throw new Error('must not dump full must-land wording')

const contract = buildBeatWriteContractBlock({
  beatIndex: 0,
  beatTotal: 4,
  chapterNumber: 10,
  chapterOutline: outline,
  mustLand: parsed,
  prevTail: '两人坐在议事厅里对坐说话。沈统领目光平视着他，账册摊在案上。',
  prevSnapshot: {
    chapter_number: 9,
    time: '未明示',
    place: '议事厅',
    cast: '秦默、沈统领',
    last_event: '对坐递账',
    updated_at: '',
  },
})
if (!contract.includes('状态相容')) throw new Error('contract needs state compat')
if (!contract.includes('本拍须落地')) throw new Error('contract needs mustLand')
if (!contract.includes('拓跋烈')) throw new Error('contract should list mustLand points')
if (!contract.includes('在场提示') && !contract.includes('上章末状态')) {
  throw new Error('contract should carry prev state or copresent hint')
}

const miss = beatMustLandInfoDeltaCovered({
  content: '广场上十万铁骑列阵。',
  mustLand: parsed,
  chapterOutline: outline,
})
if (miss.ok) throw new Error('should miss 拓跋烈 / 反噬')
if (!miss.missing.some(m => m.includes('拓跋'))) throw new Error(`missing list: ${miss.missing}`)

const hit = beatMustLandInfoDeltaCovered({
  content: '令牌累计十万兵，反噬倒计时正式启动。斥候急报：北狄拓跋烈已犯边。',
  mustLand: parsed,
  chapterOutline: outline,
})
if (!hit.ok) throw new Error(`should cover: ${hit.missing}`)

// 章缝维度扇出 → 只保留一条 cold_open
const dims = Array.from({ length: 8 }, (_, i) => ({
  dimension: `维${i}`,
  status: 'fail' as const,
  reason: `断裂${i}`,
  excerpt: '卯时的光刚透进窗纸，秦默就醒了。',
}))
const mapped = mapOutlineBoundaryModelViolations({
  ok: false,
  reason: '章缝回卷',
  dimensions: dims,
  violations: [],
})
const colds = mapped.filter(r => r.code === 'chapter_seam_cold_open')
if (colds.length !== 1) {
  throw new Error(`expected 1 cold_open after dedupe, got ${colds.length}: ${JSON.stringify(mapped)}`)
}

// ≥9 章：信息增量须挂到预算 mustLand（meta 不进拍序列时）
import {
  attachInfoDeltaMustLandToBudgetItems,
  resolveChapterBeatBudgets,
} from '../src/services/novel/novel-chapter-beat-budget.js'

const ch10Outline = [
  '立旗北境',
  '【本章起因】卯时签到，玄铁令牌累计出兵十万整，十万铁骑列阵。',
  '【欲望】秦默要借十万大军立威，收服旧部。',
  '【阻碍】秦德东煽动哗变；沈青鸾抵达试探。',
  '【局面变化】秦默当众点破秦德东通匪证据，十万铁骑齐喝镇压，秦德东绑缚示众，沈青鸾旁观神色复杂。',
  '【人物选择】秦默选择不杀秦德东，以族规处置；赵铁柱拔刀护主彻底归心。',
  '【章末问题】令牌反噬倒计时启动；北狄拓跋烈率千骑已越过边境，斥候急报至黑风岭。令牌异动意味着什么？',
  '【信息增量】令牌累计十万兵，反噬倒计时正式启动；秦德东通匪证据曝光，旧部彻底归心；沈青鸾对秦默态度松动，镇妖司与黑风岭关系出现转机；北狄拓跋烈犯边，第二卷主敌登场。',
].join('\n')

const budgets10 = resolveChapterBeatBudgets({
  chapterOutline: ch10Outline,
  userTarget: 3000,
  chapterNumber: 10,
})
const allLand = budgets10.items.flatMap(it => it.mustLand || [])
if (!allLand.some(m => m.includes('拓跋烈'))) {
  throw new Error(`ch10 mustLand must include 拓跋烈, got ${JSON.stringify(budgets10.items.map(i => ({ tag: i.tag, n: i.mustLand?.length })))}`)
}
if (!allLand.some(m => m.includes('曝光') || m.includes('归心'))) {
  throw new Error('ch10 mustLand must include 曝光/归心 point')
}
if (!budgets10.items.some(it => it.tag === '章末问题')) {
  throw new Error('长【章末问题】须进入拍序列')
}

const attached = attachInfoDeltaMustLandToBudgetItems(
  [{ index: 1, phase: '收束', beat: '收', targetChars: 100, minChars: 80, maxChars: 120 }],
  ch10Outline,
)
if ((attached[0]?.mustLand?.length || 0) < 3) {
  throw new Error('single-beat attach must hang info delta')
}

console.log('verify-beat-write-contract OK', {
  mustLand: parsed.length,
  coldOpen: colds.length,
  ch10Beats: budgets10.beatCount,
  ch10Land: allLand.length,
})
