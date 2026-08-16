/**
 * 吸引力 L1+L2 契约冒烟（不调 LLM）
 * Run: npx tsx scripts/verify-commercial-appeal-l1-l2.ts
 */
import { resolveChapterCraftRewriteMax } from '../src/common/novel/novel-meta.js'
import { buildChapterCraftFixPrompt, computeDramaGatePassed } from '../src/services/novel/novel-chapter-craft-check.js'
import type { ChapterCraftResult } from '../src/services/novel/novel-chapter-craft-check.js'
import {
  detectAppealCapabilitySellLate,
  detectAppealOpeningSoftCollapse,
  detectAppealRepeatInventory,
  listOpeningAppealHardFails,
  buildCommercialAppealAudit,
} from '../src/services/novel/novel-commercial-appeal-audit.js'
import {
  applyAppealFeelVeto,
  parseAppealFeelJson,
  shouldRunAppealFeelAudit,
} from '../src/services/novel/novel-commercial-appeal-feel.js'
import { WEBNOVEL_CHAPTER_PROSE_GUIDE } from '../src/agents/webnovel-prose-style.js'
import { buildBeatOpeningRule } from '../src/services/novel/novel-chapter-beat-generate.js'

function pad(s: string, minChars: number): string {
  let out = s.replace(/\s+/g, '')
  while (out.length < minChars) out += '他坐在炕上缓了口气，屋里冷得很。'
  return out
}

/** 平淡样章：有踹门催债，中段糊糊，能力过晚，重复盘点 */
const flatSample = [
  '“二哥，门踹开！”外头一声闷响，破木门哐当撞在土墙上。',
  '两个裹黑棉袄的男人闯进来。打头的四十来岁，进屋先拿眼扫了一圈：',
  '“醒了？你爹瘫了，你娘瞎了，你家欠队里80块工分债，今儿你把这契签了，正屋三间房抵给我。”',
  '他从怀里摸出张皱巴巴的纸，啪地拍在炕沿上，上头歪歪扭扭写着让房契三个字。',
  pad('炕上灰很大，风从门缝灌进来。', 280),
  // 400～900：糊糊且无反制词
  '秦建国脑子还糊着，太阳穴突突跳，嗓子干得冒火，记忆轰地涌上来，乱七八糟像一锅糊糊。',
  '他明明记得昨晚还在工地上，怎么一睁眼就躺这土炕上？原主是个什么东西他还没摸清。',
  pad('他盯着房梁发呆，一句硬话都挤不出来。', 200),
  // 重复盘点（与开篇契纸/骂名/弟妹/家底跨距≥400）
  '懒汉二流子的骂名烫着脑门。三个孩子挤在炕尾，怯怯地瞄他，像看一头牲口。',
  '那张纸还在炕沿上。爹瘫了娘瞎了，正屋三间工分债还挂着。',
  '他又把让房契看了一眼，仍没敢吭声，更没提什么手艺。',
].join('')

const tightSample = [
  '“二哥，门踹开！”破木门哐当撞墙。秦卫东闯进来拍出让房契：',
  '“欠队里80块工分债，正屋三间抵给我。”',
  '秦建国嗤笑，一把撕了契：“账本呢？没有就滚。',
  '队里柴油机我三天修好，工分归我还债。修不好房你拿走。”',
  '三个孩子眼里亮了一下。秦卫东愣住，把碎纸揣回怀里。',
].join('')

const flatFails = listOpeningAppealHardFails(flatSample, 1)
if (flatFails.length < 1) {
  throw new Error(`flat sample should L1-fail, got none. len=${flatSample.replace(/\s+/g, '').length}`)
}
const flatCodes = new Set(flatFails.map((f) => f.code))
if (![...flatCodes].some((c) =>
  c === 'opening_soft_collapse'
  || c === 'wake_inventory_opening' || c === 'opening_pressure_window' || c === 'opening_sell_point'
)) {
  throw new Error(`flat sample should hit structural L1, got ${[...flatCodes].join(',')}`)
}
if ([...flatCodes].some((c) =>
  c === 'hate_late' || c === 'shuang_gap' || c === 'ji_pan_gap'
  || c === 'capability_sell_late' || c === 'emotion_beats_missing' || c === 'emotion_beats_order'
  || c === 'repeat_inventory'
)) {
  throw new Error(`semantic/repeat soft codes must not hard-fail, got ${[...flatCodes].join(',')}`)
}

const tightFails = listOpeningAppealHardFails(tightSample, 1)
if (tightFails.length) {
  throw new Error(`tight sample should pass L1, got ${tightFails.map((f) => f.code).join(',')}`)
}
if (detectAppealOpeningSoftCollapse(tightSample, 1)) throw new Error('tight soft_collapse')
if (detectAppealCapabilitySellLate(tightSample, 1)) throw new Error('tight capability')
if (detectAppealRepeatInventory(tightSample, 1)) throw new Error('tight repeat')

const ch9 = listOpeningAppealHardFails(flatSample, 9)
if (ch9.some((f) => f.code === 'opening_soft_collapse')) {
  throw new Error('chapter 9 must not run extended L1')
}

if (shouldRunAppealFeelAudit({ chapterNumber: 1, craftModelFailed: false, hardFailCount: 1 })) {
  throw new Error('L1 hard fail must skip L2')
}
if (!shouldRunAppealFeelAudit({ chapterNumber: 8, craftModelFailed: false, hardFailCount: 0 })) {
  throw new Error('ch8 L1 pass should allow L2')
}
if (shouldRunAppealFeelAudit({ chapterNumber: 9, craftModelFailed: false, hardFailCount: 0 })) {
  throw new Error('ch9 must not run L2')
}
if (shouldRunAppealFeelAudit({ chapterNumber: 1, craftModelFailed: true, hardFailCount: 0 })) {
  throw new Error('craftModelFailed must skip L2')
}

const feel = parseAppealFeelJson('{"flat":true,"mid_cooling":true,"missing_payoff":"爽点晚","fix_directive":"删糊糊，提前撕契与修机对赌"}')
if (!feel.flat) throw new Error('parse flat')

const gatesAllOk = {
  desire_on_page: { level: '有' as const },
  obstacle_on_page: { level: '有' as const },
  choice_on_page: { level: '有' as const },
  hook_on_page: { level: '有' as const },
  info_delta: { level: '有' as const },
  emotion_shown: { level: '有' as const },
  theme_echo: { level: '有' as const },
  conflict_layer: { level: '有' as const },
  stakes_shift: { level: '有' as const },
  opening_promise: { level: '有' as const },
}
const veto = applyAppealFeelVeto(gatesAllOk, feel)
if (!veto.vetoed || veto.drama_gates.opening_promise.level !== '无') {
  throw new Error('flat must set opening_promise=无')
}
if (computeDramaGatePassed(veto.drama_gates)) {
  throw new Error('after feel veto drama_gate_passed must be false')
}
// craft.passed projection: score ok but drama fail → not passed
const craftPassedProj = !false && 80 >= 70 && (false || (true && computeDramaGatePassed(veto.drama_gates)))
if (craftPassedProj) throw new Error('craft.passed must be false after flat veto')

const appeal = buildCommercialAppealAudit({
  craft: { drama_gates: veto.drama_gates, checked_at: new Date().toISOString() },
  content: tightSample,
  chapterNumber: 1,
  feel,
})
if (appeal.passed) throw new Error('feel flat must fail appeal')
if (!appeal.dimensions.some((d) => d.code === 'llm_feel_flat' && !d.passed)) {
  throw new Error('expected llm_feel_flat')
}

const craftForFix = {
  score: 50,
  min_score: 70,
  passed: false,
  conflicts: [],
  functions_hit: 2,
  dimensions: {},
  compliance_veto: false,
  compliance_reasons: [],
  content_hash: 'x',
  checked_at: new Date().toISOString(),
  drama_gates: veto.drama_gates,
  drama_gate_passed: false,
  summary: 'x',
  tags: {},
  soft_alerts: [],
  appeal,
} as ChapterCraftResult
const fix = buildChapterCraftFixPrompt('原说明', craftForFix)
if (!fix.includes('删糊糊') && !fix.includes('吸引力硬修') && !fix.includes('吸引力')) {
  throw new Error(`fix prompt should include feel directive, got: ${fix.slice(0, 200)}`)
}

if (resolveChapterCraftRewriteMax({}) !== 3) {
  throw new Error('default rewrite max must be 3')
}

if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('开篇反制')) {
  throw new Error('prose guide missing 开篇反制')
}
if (!WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('能力卖点')) {
  throw new Error('prose guide missing 能力卖点')
}
const openCh1 = buildBeatOpeningRule({ chapterNumber: 1 })
if (!openCh1.includes('恨') || !openCh1.includes('压力方')) {
  throw new Error('beat opening missing 恨场/压力方')
}

console.log('verify-commercial-appeal-l1-l2 OK', {
  flatCodes: [...flatCodes],
  fixHasDirective: fix.includes('删糊糊'),
})
