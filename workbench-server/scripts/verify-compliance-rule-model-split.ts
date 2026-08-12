/**
 * 规则 vs 模型审分工验收（全维度）
 * Run: npx tsx scripts/verify-compliance-rule-model-split.ts
 */
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'
import { getOutlineBoundaryAuditSystemPromptForTest } from '../src/services/novel/novel-outline-boundary-audit.js'
import { stripOutlinePoisonProse } from '../src/services/novel/novel-outline-poison-strip.js'
import {
  detectChapterSeamColdOpen,
  detectChapterSeamReplay,
  detectStaleOutlineWeakContinuation,
  detectOutlineBeatOrderRewind,
  findStaleOutlineBeats,
  filterStaleCatalystBeatItems,
  extractOutlineBeatItems,
} from '../src/services/novel/novel-chapter-seam.js'
import { detectOpeningAgainstChapterEndSnapshot } from '../src/services/novel/novel-chapter-end-snapshot.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'
import type { ChapterEndSnapshot } from '../src/common/novel/novel-continuity-state.js'

function pad(s: string, n: number): string {
  let out = s
  while ([...out].length < n) out += s
  return out
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const prevForest =
  '雪越下越密。秦卫国眯起眼，辨认前方黑黢黢的林子，脚步踩实，一步步往林子深处走。'

const outlineCh4 = [
  '【本章起因】秦卫国踏入白雪皑皑的林场深处',
  '【局面变化】发现野兔踪迹',
  '【人物选择】冷静判断，设下陷阱',
  '【章末问题】陷阱能否奏效？',
].join('\n')

// ——— 1) 规则不得因叙事相位硬拦 ———
const casesNoRuleSeam: Array<{ name: string; content: string; prev?: string }> = [
  {
    name: '时辰补叙：先写晨光再交代昨夜',
    prev: pad('日头正中，他收起刀往回走。', 200),
    content: pad(
      '晨光刚亮时他已在林缘。那是补叙：昨夜他其实在雪地挨到后半夜，这才摸到背风坡。他发现野兔踪迹，冷静设下陷阱。',
      900,
    ),
  },
  {
    name: '先果后因：先写余波再补来者',
    prev: pad('屋里灯灭了，两人各自睡下。', 200),
    content: pad(
      '门口已经站着人。秦卫国这才看清来的是邻居王婶，刚才那阵拍门声把苏婉惊醒——原来是先果后因。他起身应门，把话说开。',
      900,
    ),
  },
  {
    name: '正叙承接进林（起因上章已近完成）',
    prev: prevForest,
    content: pad(
      '秦卫国在齐膝雪里放慢脚步，扫过兽道，很快发现野兔踪迹。他冷静判断，动手设下陷阱，屏住呼吸等着。',
      900,
    ),
  },
  {
    name: '天候「才开始」措辞（不得规则硬拦）',
    prev: pad('雪越下越密，打在脸上生疼。他往林子走。', 200),
    content: pad(
      '雪是下午才开始落的——他后来才想清那是错觉。其实雪早下密了。他踏入林场深处，发现踪迹，设下陷阱。',
      900,
    ),
  },
  {
    name: '倒叙开篇再回当前',
    prev: pad('他已经走进林缘。', 200),
    content: pad(
      '两年前他也这样走过雪地，那是倒叙。拉回眼前：他发现野兔踪迹，冷静设下陷阱，等着能否奏效。',
      900,
    ),
  },
]

for (const c of casesNoRuleSeam) {
  const r = detectOutlineCompliance({
    content: c.content,
    chapterOutline: outlineCh4,
    prevChapterTail: c.prev,
    chapterNumber: 4,
  })
  const seam = r.reasons.filter(x =>
    x.code === 'chapter_seam_cold_open'
    || x.code === 'weather_process_soft'
    || x.code === 'catalyst_agency_fail'
    || x.code === 'opening_unexplained_name'
    || x.code === 'opening_mid_dialogue'
    || x.code === 'chapter_event_replay',
  )
  console.log(`no-rule-seam [${c.name}]`, r.reasons.map(x => x.code))
  assert(seam.length === 0, `${c.name}: rule must not emit narrative seam codes, got ${seam.map(x => x.code)}`)
}
console.log('PASS narrative cases not rule-hard')

// ——— 2) 规则仍须抓住机械越界 ———
const overshoot = pad(
  '秦卫国踏入白雪皑皑的林场深处，发现野兔踪迹，冷静设下陷阱。',
  400,
) + pad(
  '天亮后果然抓到野兔，回程遇上赵大彪，冷漠无视，回家炖汤香气四溢，邻居眼红。',
  1200,
)
const rOver = detectOutlineCompliance({
  content: overshoot,
  chapterOutline: outlineCh4,
  prevChapterTail: prevForest,
  chapterNumber: 4,
})
console.log('mechanical overshoot', rOver.reasons.map(x => x.code))
assert(
  rOver.reasons.some(r => r.code === 'outline_endpoint_overshoot' || r.code === 'next_chapter_beat_leak'),
  'rule must still catch endpoint overshoot / next leak',
)

const nextOutline = [
  '【本章起因】陷阱成功捕获野兔',
  '【人物选择】不与小人计较，专注回家',
].join('\n')
const leakBody = pad(
  '他设下陷阱之后不久，成功捕获野兔，拎着往家走，路上不与赵大彪计较。',
  1000,
)
const rLeak = detectOutlineCompliance({
  content: leakBody,
  chapterOutline: outlineCh4,
  nextChapterOutline: nextOutline,
  prevChapterTail: prevForest,
  chapterNumber: 4,
})
console.log('next leak', rLeak.reasons.map(x => x.code))
assert(
  rLeak.reasons.some(r => r.code === 'next_chapter_beat_leak' || r.code === 'outline_endpoint_overshoot'),
  'rule must catch next-chapter completion leak or overshoot',
)
console.log('PASS mechanical overshoot/leak')

// ——— 3) 删毒仍机械可用 ———
const stripped = stripOutlinePoisonProse({ content: overshoot, chapterOutline: outlineCh4 })
assert(stripped.changed && !/炖汤|赵大彪/.test(stripped.text), 'poison strip must remove post-endpoint')
console.log('PASS poison strip')

// ——— 4) 模型提示声明允许手法 ———
const sys = getOutlineBoundaryAuditSystemPromptForTest()
assert(/倒叙|先果后因|正叙/.test(sys), 'model system must allow narrative orders')
assert(/真吃书|因果|逻辑不自洽/.test(sys), 'model system must judge real continuity breaks')
assert(!/时辰倒退.*硬|必须按钟点/.test(sys), 'model system must not hard-require clock order')
assert(/过程.*相位|相位倒退/.test(sys), 'model system must catch process phase rewind via 自洽')
console.log('PASS model prompt policy')

// ——— 5) 工具函数仍可检出（供诊断），但不等于合规硬链 ———
const utilCold = detectChapterSeamColdOpen({
  content: pad('天没亮他醒了，开门出门进山。', 500),
  chapterNumber: 5,
  prevChapterTail: pad('他已在林缘设套。', 200),
  chapterOutline: '设好陷阱 / 猎获野兔',
})
console.log('util detector still exists:', !!utilCold)
assert(utilCold, 'utility detector may still flag (not wired to rule compliance)')
const utilInCompliance = detectOutlineCompliance({
  content: pad('天没亮他醒了，开门出门进山。', 500),
  chapterNumber: 5,
  prevChapterTail: pad('他已在林缘设套。', 200),
  chapterOutline: '设好陷阱 / 猎获野兔',
})
assert(
  !utilInCompliance.reasons.some(r => r.code === 'chapter_seam_cold_open'),
  'utility cold must not appear on rule compliance path',
)
console.log('PASS util vs compliance split')

// ——— 6) 一致性硬审路径：地点/经过字面 miss 不得再硬拦（此前验收漏测）——
const snap: ChapterEndSnapshot = {
  chapter_number: 3,
  time: '天色灰蒙将亮未亮',
  place: '北疆林场家属院破败茅屋外，齐膝深积雪，院门口歪脖子榆树',
  cast: '秦卫国',
  last_event: '秦卫国在院门口拢棉袄，辨认天色。',
  updated_at: new Date().toISOString(),
}
// 开篇已在林中推进（与契约字面 bigram 无交集）——旧硬审会报「地点/经过倒退」
const continueInForest = pad(
  '他沿着兽道放慢脚步，很快发现野兔踪迹，冷静判断后动手设下陷阱，屏住呼吸等着。',
  900,
)
const utilPlace = detectOpeningAgainstChapterEndSnapshot({
  content: continueInForest,
  chapterNumber: 4,
  prevSnapshot: snap,
})
assert(utilPlace, 'utility place detector should still flag lexical miss (diagnostic only)')
assert(/地点\/经过倒退/.test(utilPlace.message), 'utility message is 地点/经过倒退')
const hardSeam = detectChapterSeamReplay({
  content: continueInForest,
  chapterNumber: 4,
  prevChapterTail: pad('秦卫国在院门口拢棉袄，辨认天色，抬脚往林子方向走。', 300),
  chapterOutline: outlineCh4,
  prevSnapshot: snap,
})
assert(
  !hardSeam || !/地点\/经过倒退/.test(hardSeam.message),
  `continuity hard path must not emit 地点/经过倒退, got: ${hardSeam?.message || 'null'}`,
)
console.log('PASS continuity hard path skips place/event lexical cold-open')

// ——— 6b) 离场再出发 / 过程相位倒退须进硬审（模型曾对本案软放行）——
const departedPrev = pad(
  '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。',
  300,
)
const courtyardReplay = pad(
  '雪是下午才开始落的。起初只是稀稀拉拉几个碎粒。秦卫国站在屋檐底下，拢了拢棉袄领子，抬头看天。他转身回屋，把麻绳绕在肩上，又摸出猎刀，门一推开往林子深处走。',
  900,
)
const hardDepart = detectChapterSeamReplay({
  content: courtyardReplay,
  chapterNumber: 4,
  prevChapterTail: departedPrev,
  chapterOutline: outlineCh4,
})
assert(hardDepart, 'hard path must catch 离场再出发 / 过程相位倒退')
assert(
  /离场吃书|天候倒退/.test(hardDepart.message),
  `hard path message must be departure or weather phase, got: ${hardDepart.message}`,
)
console.log('PASS continuity hard path catches departure/weather phase', hardDepart.message.slice(0, 40))

// ——— 7) 弱承接+大纲过期 / 拍点倒序不得进硬审（ch3→ch4 假阳性）——
const forestPrev = pad(
  '秦卫国眯起眼，辨认着前方那片黑黢黢的林子，踩实雪地一步步往林子深处走。',
  400,
)
const ch4OutlineDrama = [
  '【本章起因】秦卫国踏入白雪皑皑的林场深处',
  '【欲望】捕获猎物',
  '【阻碍】极寒与体能',
  '【局面变化】发现野兔踪迹',
  '【人物选择】冷静设下陷阱',
].join('\n')
assert(
  findStaleOutlineBeats(ch4OutlineDrama, forestPrev).some(s => /踏入|林场/.test(s)),
  'utility: 踏入应标过期',
)
const forwardOpen = pad(
  '他沿着兽道放慢脚步，很快发现野兔踪迹，冷静判断后动手设下陷阱，屏住呼吸等着。',
  900,
)
const utilWeak = detectStaleOutlineWeakContinuation({
  content: forwardOpen,
  chapterNumber: 4,
  prevChapterTail: forestPrev,
  chapterOutline: ch4OutlineDrama,
})
assert(utilWeak, 'utility weak+stale may still flag (diagnostic)')
const hardWeak = detectChapterSeamReplay({
  content: forwardOpen,
  chapterNumber: 4,
  prevChapterTail: forestPrev,
  chapterOutline: ch4OutlineDrama,
})
assert(
  !hardWeak || !/弱承接|拍点倒序|大纲过期|冷开篇|地点\/经过/.test(hardWeak.message),
  `hard path must not emit weak/order, got: ${hardWeak?.message || 'null'}`,
)
const utilOrder = detectOutlineBeatOrderRewind({
  content: pad('秦卫国踏入白雪皑皑的林场深处，雪没过膝盖。', 900),
  chapterNumber: 4,
  prevChapterTail: forestPrev,
  chapterOutline: ch4OutlineDrama,
})
// order utility may or may not fire depending on phrase match; hard must not
const hardOrder = detectChapterSeamReplay({
  content: pad('秦卫国踏入白雪皑皑的林场深处，雪没过膝盖。随后发现踪迹设陷阱。', 900),
  chapterNumber: 4,
  prevChapterTail: forestPrev,
  chapterOutline: ch4OutlineDrama,
})
assert(
  !hardOrder || !/弱承接|拍点倒序|大纲过期/.test(hardOrder.message),
  `hard path must not emit order rewind, got: ${hardOrder?.message || 'null'}`,
)
console.log('PASS continuity hard skips weak+stale/order', {
  utilWeak: !!utilWeak,
  utilOrder: !!utilOrder,
})

// 过期起因不进拍点预算
const itemsAll = extractOutlineBeatItems(ch4OutlineDrama)
const itemsFiltered = filterStaleCatalystBeatItems(itemsAll, forestPrev)
assert(
  itemsAll.some(i => i.tag === '本章起因') && !itemsFiltered.some(i => i.tag === '本章起因'),
  'stale catalyst must be filtered from beat items',
)
const budgets = resolveChapterBeatBudgets({
  chapterOutline: ch4OutlineDrama,
  userTarget: 2800,
  prevChapterTail: forestPrev,
})
assert(
  !budgets.items.some(i => i.tag === '本章起因'),
  'beat budgets must drop stale 本章起因',
)
assert(budgets.items[0]?.phase !== '起因' || budgets.items[0]?.tag !== '本章起因', 'first budget not stale catalyst')
console.log('PASS stale catalyst skipped in beat budgets', budgets.items.map(i => i.phase))

console.log('ALL PASS')
