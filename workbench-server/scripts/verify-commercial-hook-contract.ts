/**
 * 网文吸引力生成契约冒烟（不调 LLM）
 * Run: npx tsx scripts/verify-commercial-hook-contract.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOVEL_OUTLINE_STRUCTURE_HINT, NOVEL_DEFAULT_PROMPTS, isMundaneNonCultivationGenre, isCultivationPowerGenre, detectOutlineCultivationBleed, buildOutlineWorldHardRequirement } from '../src/agents/novel-defaults.js'
import { WEBNOVEL_CHAPTER_PROSE_GUIDE } from '../src/agents/webnovel-prose-style.js'
import {
  buildAppealSingleCodeFixBlock,
  EMOTION_CORE_CONTRACT_VERSION,
} from '../src/services/novel/novel-emotion-core-contract.js'
import {
  buildChapterOutlineDramaPromptBlock,
  OUTLINE_DRAMA_PRIORITY_LINE,
  assertOutlineChapterFields,
} from '../src/services/novel/novel-outline-drama-fields.js'
import {
  buildBeatOpeningRule,
  buildBeatEndingRule,
} from '../src/services/novel/novel-chapter-beat-generate.js'
import { buildChapterCraftFixPrompt } from '../src/services/novel/novel-chapter-craft-check.js'
import type { ChapterCraftResult } from '../src/services/novel/novel-chapter-craft-check.js'
import {
  buildCommercialAppealAudit,
  detectAppealOpeningExpositionSoft,
  detectAppealWakeInventoryOpening,
  detectAppealOpeningPressureWindow,
  detectAppealOpeningSellPoint,
  detectAppealHateThinDecompress,
  detectStakesMismatchText,
  extractCommonSenseAnchorAmount,
  extractActiveDemandAmounts,
  evaluateStakesCommonSense,
  listOpeningAppealHardFails,
} from '../src/services/novel/novel-commercial-appeal-audit.js'

function mustInclude(label: string, hay: string, needles: string[]) {
  for (const n of needles) {
    if (!hay.includes(n)) throw new Error(`${label} missing: ${n}`)
  }
}

// Task1: outline HINT
mustInclude('HINT', NOVEL_OUTLINE_STRUCTURE_HINT, [
  '本章起因',
  '冲突切口',
  '对白',
  '章末问题',
  '未决',
  '信息增量',
  '第1～5章',
  '人物定名合同',
  '无名称谓',
  '开篇对峙拍',
  '卖点首屏',
  '同辈字辈一致',
  '时代背景',
  '禁止',
  '筑基',
  '2026-08-16-v3-ssot',
  '动作震慑',
])
mustInclude('prose', WEBNOVEL_CHAPTER_PROSE_GUIDE, [
  EMOTION_CORE_CONTRACT_VERSION,
  '动作震慑',
  '本事露尖',
  '拢共天数',
])
mustInclude('outline agent', NOVEL_DEFAULT_PROMPTS.novel_outline.instructions, ['吸引力', '冲突切口', '人物定名', '字辈'])
{
  const block = buildAppealSingleCodeFixBlock({
    hardFails: [
      { code: 'hate_thin_decompress', message: 'a' },
      { code: 'stakes_mismatch', message: 'b' },
    ],
  })
  if (!block.includes('本轮只修最高优先级一码') || !block.includes(EMOTION_CORE_CONTRACT_VERSION)) {
    throw new Error('craft single-code fix block must include SSOT version')
  }
  if (block.includes('本轮硬拦【stakes_mismatch】')) {
    throw new Error('single-code fix must not hard-list second code as 本轮硬拦')
  }
}
if (!isMundaneNonCultivationGenre('年代重生') || isCultivationPowerGenre('年代重生')) {
  throw new Error('年代重生 must be mundane non-cultivation')
}
if (!isCultivationPowerGenre('都市修真') || isMundaneNonCultivationGenre('都市修真')) {
  throw new Error('都市修真 must be cultivation power genre')
}
if (!isCultivationPowerGenre('种田修真') || isMundaneNonCultivationGenre('种田修真')) {
  throw new Error('种田修真 must be cultivation power genre')
}
if (isMundaneNonCultivationGenre('种田') || isCultivationPowerGenre('种田')) {
  throw new Error('bare 种田 must be ambiguous (neither hard A nor hard B)')
}
if (detectOutlineCultivationBleed('【世界观设定】\n修炼体系：淬体-凝气-筑基\n', '种田')) {
  throw new Error('bare 种田 must not hard-fail cultivation bleed (may be farming-xianxia)')
}
if (!detectOutlineCultivationBleed('【世界观设定】\n修炼体系：淬体-凝气-筑基\n', '年代文')) {
  throw new Error('年代文 outline with 筑基 must fail bleed detect')
}
if (detectOutlineCultivationBleed('【世界观设定】\n时代背景：1976\n地域：西北\n组织/规则：大队\n', '年代文')) {
  throw new Error('clean 年代文 outline must pass bleed detect')
}
if (!buildOutlineWorldHardRequirement('年代文').includes('禁止') || buildOutlineWorldHardRequirement('年代文').includes('完整境界链')) {
  throw new Error('年代文 hard req must ban cultivation chain')
}
if (!buildOutlineWorldHardRequirement('玄幻').includes('修炼体系')) {
  throw new Error('玄幻 hard req must require cultivation')
}
if (!buildOutlineWorldHardRequirement('种田修真').includes('修炼体系') || !buildOutlineWorldHardRequirement('种田修真').includes('种田修真')) {
  throw new Error('种田修真 hard req must require cultivation chain')
}
if (!buildOutlineWorldHardRequirement('种田').includes('种田修真')) {
  throw new Error('bare 种田 hard req must mention 种田修真 → A branch')
}

{
  const badStake = '欠他的三块钱今天必须还，不还就把西偏房的门板卸走抵账。三日内拿不出三块钱，门板卸走，透风冻死人。'
  if (!detectStakesMismatchText(badStake)) {
    throw new Error('三块主催（默认锚2→须≥40）must detect stakes mismatch')
  }
  const okStake =
    '【常识锚】壮劳力月余约2块。要清一百二十块今天必须还，不还就把西偏房收走。'
  if (detectStakesMismatchText(okStake)) {
    throw new Error('锚2×20=40、主催120 must pass stakes check')
  }
  const bypassStake =
    '欠他的三块钱今天必须还，不还就把西偏房的门板卸走抵账。另有一百二十块总账秋后算。'
  if (!detectStakesMismatchText(bypassStake)) {
    throw new Error('三块主催+一百二十旁衬 must still stakes-mismatch')
  }
  // 回归：勿把「常识锚×16」当锚；勿把「三十二」拆成「十二」
  const messy =
    '壮劳力月余约2块算，三十二块七毛四顶得了一年半，是常识锚×16。天亮前把欠队里的三十二块七毛四交清。'
  if (extractCommonSenseAnchorAmount(messy) !== 2) {
    throw new Error(`anchor must be 2 from 月余约2块, got ${extractCommonSenseAnchorAmount(messy)}`)
  }
  const dem = extractActiveDemandAmounts(messy)
  if (!dem.includes(32) || dem.includes(12) || dem.includes(16)) {
    throw new Error(`demand must include 32 not 12/16, got ${JSON.stringify(dem)}`)
  }
  const ev = evaluateStakesCommonSense(messy)
  if (ev.ok || ev.anchor !== 2 || !ev.demands.includes(32)) {
    throw new Error(`messy eval should fail with anchor2 demand32, got ${JSON.stringify(ev)}`)
  }
  const ch1 = [
    '第1章：穿来就是债',
    '【本章时间】1976年',
    '【本章地点】西偏房',
    '【本章人物】秦建国、秦卫东',
    '【本章起因】秦卫东拍门要三块钱，不还卸门板',
    '【欲望】弄清烂账',
    '【阻碍】欠三块',
    '【局面变化】认账三日还清保住门板',
    '【人物选择】先认账',
    '【冲突层】人际',
    '【情绪手法】对峙',
    '【章末问题】三块从哪来',
    '【信息增量】账目曝光',
    '【主题回响】认清刀口',
    '【恨】秦卫东要三块钱+卸门板',
    '【爽】秦建国动作震慑并露尖修机本事',
    '【急】三天期限，拿不出三块钱门板卸走透风冻死',
    '【盼】缺一环：翻出旧铜套',
    '【爽型】当众对赌',
  ].join('\n')
  const badCh = assertOutlineChapterFields(ch1, 1)
  if (badCh.ok || !badCh.invalid.some((i) => i.includes('赌注错位'))) {
    throw new Error('outline ch1 with 三块+卸门 must invalid stakes')
  }
}

{
  const thin = [
    '“开门！秦建国你个懒骨头，太阳照屁股了还装死呢！”门板被踹得砰砰响，糊窗的报纸簌簌掉渣。',
    '秦建国一下睁了眼。头顶是发黑的房梁，北风从墙缝里钻进来，刀子似的刮脸。',
  ].join('')
  if (!detectAppealHateThinDecompress(thin, 1)) {
    throw new Error('thin kick+wake dump must fail hate_thin_decompress')
  }
  if (!listOpeningAppealHardFails(thin, 1).some((f) => f.code === 'hate_thin_decompress')) {
    throw new Error('hate_thin_decompress must be hard fail')
  }
  const thick = [
    '“开门！秦建国，欠队里一百二十块工分债不还，今天就把后罩房收走，你们全家滚出去！”门板被踹得砰砰响。',
    '秦德东闯进来，字据往炕上一甩。',
  ].join('')
  if (detectAppealHateThinDecompress(thick, 1)) {
    throw new Error('stake-first opening must not fail hate_thin_decompress')
  }
}

const outlineSkill = readFileSync(
  join(process.cwd(), '../agent-skills/novel_outline/SKILL.md'),
  'utf8',
)
mustInclude('outline skill', outlineSkill, ['人物定名', '无名称谓', '施压', '字辈'])
const hooksSkill = readFileSync(
  join(process.cwd(), '../agent-skills/novel_outline/chapter_hooks/SKILL.md'),
  'utf8',
)
mustInclude('hooks skill', hooksSkill, ['本章人物', '无名称谓', '施压', '字辈'])

// Task2: prose + drama
mustInclude('PROSE_GUIDE', WEBNOVEL_CHAPTER_PROSE_GUIDE, [
  '短平快', '对白或冲突', '章尾挖坑', '开篇', '卖点首屏',
  '开篇反制', '能力卖点', '禁说明书节奏', '字辈沿用', EMOTION_CORE_CONTRACT_VERSION,
])
const drama = buildChapterOutlineDramaPromptBlock({
  chapterNumber: 1,
  time: '次日',
  place: '院内',
  cast: '甲、乙',
  catalyst: '冲突',
  desire: '护住',
  obstacle: '阻力',
  stakesShift: '推进',
  choice: '选择',
  conflictLayers: ['人际'],
  emotionCraft: '冷',
  endingQuestion: '名单会不会点到她？',
  infoDelta: '卖点',
  themeEcho: '尊严',
})
mustInclude('drama block', drama, ['冲突可见', '未决事件', '卖点'])
mustInclude('priority', OUTLINE_DRAMA_PRIORITY_LINE, ['恨→爽→急→盼', '开篇压力', '章末未决', '第三版三刀', EMOTION_CORE_CONTRACT_VERSION])

// Task3: beat rules
mustInclude('open ch1', buildBeatOpeningRule({ chapterNumber: 1 }), ['压力方', '卖点', '冻醒', '恨', '冲突前置'])
mustInclude('open ch2', buildBeatOpeningRule({ chapterNumber: 2 }), ['承接', '爆发', '冲突'])
mustInclude('end', buildBeatEndingRule({ hasNextHead: false }), ['章末问题', '未决', '感慨'])

// Task4: brief meta ≠ pacing template abuse
const brief = NOVEL_DEFAULT_PROMPTS.novel_writing_brief.instructions
mustInclude('brief meta', brief, ['短平快', 'Meta', '前三分之一'])
if (/须在前三分之一短平快/.test(brief)) {
  throw new Error('brief must not use meta as pacing clause template')
}
const briefSkill = readFileSync(
  join(process.cwd(), '../agent-skills/novel_writing_brief/chapter_craft_core/SKILL.md'),
  'utf8',
)
mustInclude('brief skill', briefSkill, ['Meta 写法契约', '禁止'])

// Task5: craft fix priority
const craft = {
  score: 50,
  min_score: 70,
  passed: false,
  conflicts: ['节奏偏慢'],
  functions_hit: 1,
  dimensions: {},
  compliance_veto: false,
  compliance_reasons: [],
  content_hash: 'x',
  checked_at: new Date().toISOString(),
  drama_gates: {
    desire_on_page: { level: '有' as const },
    obstacle_on_page: { level: '有' as const },
    choice_on_page: { level: '有' as const },
    hook_on_page: { level: '无' as const, note: '弱' },
    info_delta: { level: '有' as const },
    emotion_shown: { level: '有' as const },
    theme_echo: { level: '有' as const },
    conflict_layer: { level: '有' as const },
    stakes_shift: { level: '无' as const, note: '缺' },
    opening_promise: { level: '无' as const, note: '缺' },
  },
  drama_gate_passed: false,
} as ChapterCraftResult
const fix = buildChapterCraftFixPrompt('原说明', craft)
const iOpen = fix.indexOf('opening_promise')
const iHook = fix.indexOf('hook_on_page')
const iStakes = fix.indexOf('stakes_shift')
if (iOpen < 0 || iHook < 0) throw new Error('fix must mention opening_promise and hook_on_page')
if (!(iOpen < iStakes && iHook < iStakes)) {
  throw new Error('opening_promise/hook_on_page must be listed before other missing gates')
}
mustInclude('fix priority line', fix, ['①开篇承诺', '②章尾钩'])

// Appeal audit（与 continuity 解耦）
const appealFail = buildCommercialAppealAudit({ craft })
if (appealFail.layer !== 'appeal') throw new Error('appeal.layer must be appeal')
if (appealFail.passed) throw new Error('missing opening/hook should fail appeal')
const softExpo = detectAppealOpeningExpositionSoft(
  [
    '“320块工分债今天结清，不然东屋连灶房一并收走！”二叔秦卫东踹门闯进来，骂他懒汉二流子。',
    '秦建国一把撕了契：“账本拿来！队里柴油机我三天修好，工分归我。”',
    '没有系统，没有异能，没有功法。生存阶梯就在眼前，温饱线压着每一天。',
    '成分不好这四个字像烙印，前世走了哪些弯路他又盘了一遍。',
  ].join(''),
  1,
)
if (!softExpo) throw new Error('expected opening exposition soft signal')
const appealSoft = buildCommercialAppealAudit({
  craft: {
    ...craft,
    drama_gates: {
      ...craft.drama_gates,
      opening_promise: { level: '有' },
      hook_on_page: { level: '有' },
    },
  },
  content: [
    '“320块工分债今天结清，不然东屋连灶房一并收走！”二叔秦卫东踹门闯进来，骂他懒汉二流子。',
    '秦建国一把撕了契：“账本拿来！队里柴油机我三天修好，工分归我。”',
    '没有系统，没有异能，没有功法。生存阶梯就在眼前，温饱线压着每一天。',
    '成分不好这四个字像烙印，前世走了哪些弯路他又盘了一遍。',
  ].join(''),
  chapterNumber: 1,
})
if (!appealSoft.passed) throw new Error('soft exposition must not hard-fail appeal')
if (!appealSoft.dimensions.some(d => d.code === 'opening_exposition_soft')) {
  throw new Error('expected opening_exposition_soft dim')
}

const wakeSample = [
  '雪沫子从头顶的破洞落下来，砸在脸上，凉得人一激灵。',
  '秦建国猛一睁眼，眼前一片昏黑，鼻腔里灌满土炕的烟灰味，又呛又闷。',
  '胳膊却沉得像灌了铅。脑子里还残留着实验室那台示波器的电流声。',
  '记得自己昨晚在赶一张电路图。空米缸敞着口，一粒米都没有，欠生产队工分债。',
  '房梁上挂着干辣椒，土墙裂着缝。',
].join('')
const wakeHit = detectAppealWakeInventoryOpening(wakeSample, 1)
if (!wakeHit) throw new Error('expected wake inventory opening hard signal')
if (!detectAppealOpeningPressureWindow(wakeSample, 1)) {
  throw new Error('wake sample should also miss pressure window')
}
const appealWake = buildCommercialAppealAudit({
  craft: {
    ...craft,
    drama_gates: {
      ...craft.drama_gates,
      opening_promise: { level: '有' },
      hook_on_page: { level: '有' },
    },
  },
  content: wakeSample,
  chapterNumber: 1,
})
if (appealWake.passed) throw new Error('wake inventory must fail appeal')
if (!appealWake.dimensions.some(d => d.code === 'wake_inventory_opening' && !d.passed)) {
  throw new Error('expected wake_inventory_opening dim fail')
}

const pressureOnly = [
  '秦建国躺在炕上想了很久，才决定明天去弄点吃的，家里太穷了。',
  '他看着房梁发呆，回想实验室里的电路图，又摸了摸空荡荡的米缸。',
  '三个孩子缩在墙角，谁也没说话，空气沉得像灌了铅。',
  '老娘在炕头叹气，谁也没再提外面的事，这一夜就这么熬过去了。',
].join('')
if (!detectAppealOpeningPressureWindow(pressureOnly, 1)) {
  throw new Error('expected pressure window fail')
}
if (!detectAppealOpeningSellPoint(pressureOnly, 1)) {
  throw new Error('expected sell point fail')
}
const goodOpen = '“320块！今天结清！”二叔秦卫东踹开门，指着他鼻子骂懒汉，“东屋我收了。”秦建国撕了契：“柴油机我三天修好还债。”他一愣：穿过来了？'
if (detectAppealOpeningPressureWindow(goodOpen, 1)) throw new Error('good open should pass pressure')
if (detectAppealOpeningSellPoint(goodOpen, 1)) throw new Error('good open should pass sell')
if (listOpeningAppealHardFails(goodOpen, 1).length) {
  throw new Error('good open should pass all L1')
}

console.log('verify-commercial-hook-contract OK')
