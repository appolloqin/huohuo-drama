/**
 * 本地可行性诊断：削层 + SSOT 方案是否值得做（不调 LLM）
 * Run: npx tsx scripts/diagnose-craft-ssot-feasibility.ts
 *
 * 证伪标准：
 * - 若叠层很薄、硬拦互不打架、fix prompt 很短 → 方案动机不足
 * - 若叠层厚、夹具呈「过A必炸B」、fix 整包回灌 → 方案有本地证据支撑
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WEBNOVEL_CHAPTER_PROSE_GUIDE } from '../src/agents/webnovel-prose-style.js'
import { NOVEL_OUTLINE_STRUCTURE_HINT } from '../src/agents/novel-defaults.js'
import {
  EMOTION_CORE_CONTRACT_VERSION,
  buildEmotionCoreProseBlock,
  buildAppealSingleCodeFixBlock,
  APPEAL_L1_FREEZE,
} from '../src/services/novel/novel-emotion-core-contract.js'
import {
  buildEmotionBeatHardRule,
  EMOTION_BEAT_PHASES,
} from '../src/services/novel/novel-chapter-emotion-beats.js'
import {
  listOpeningAppealHardFails,
  detectStakesMismatchText,
} from '../src/services/novel/novel-commercial-appeal-audit.js'
import { buildChapterCraftFixPrompt } from '../src/services/novel/novel-chapter-craft-check.js'
import type { ChapterCraftResult } from '../src/services/novel/novel-chapter-craft-check.js'
import { DRAMA_GATE_CODES } from '../src/services/novel/novel-chapter-craft-check.js'

type Row = { name: string; codes: string[]; ok: boolean }

function banCount(s: string): number {
  return (s.match(/禁止|勿|不得|禁 /g) || []).length
}

function countPhraseCopies(phrase: string, files: Record<string, string>): number {
  let n = 0
  for (const text of Object.values(files)) {
    if (text.includes(phrase)) n += 1
  }
  return n
}

function hardCodes(content: string): string[] {
  return listOpeningAppealHardFails(content, 1).map((f) => f.code)
}

const root = join(process.cwd(), 'src')
const files: Record<string, string> = {
  defaults: readFileSync(join(root, 'agents/novel-defaults.ts'), 'utf8'),
  prose: readFileSync(join(root, 'agents/webnovel-prose-style.ts'), 'utf8'),
  emotion: readFileSync(join(root, 'services/novel/novel-chapter-emotion-beats.ts'), 'utf8'),
  craft: readFileSync(join(root, 'services/novel/novel-chapter-craft-check.ts'), 'utf8'),
  audit: readFileSync(join(root, 'services/novel/novel-commercial-appeal-audit.ts'), 'utf8'),
  ensure: readFileSync(join(root, 'services/novel/novel-outline-drama-ensure.ts'), 'utf8'),
}

const hardRules = EMOTION_BEAT_PHASES.map((p) => buildEmotionBeatHardRule(p)).join('\n')
const proseBans = banCount(WEBNOVEL_CHAPTER_PROSE_GUIDE)
const hintBans = banCount(NOVEL_OUTLINE_STRUCTURE_HINT)
const emotionBans = banCount(hardRules)
const craftFixBans = banCount(files.craft)

const phraseHits = {
  动作震慑: countPhraseCopies('动作震慑', files),
  本事露尖: countPhraseCopies('本事露尖', files),
  拢共天数: countPhraseCopies('拢共天数', files),
  缺一环: countPhraseCopies('缺一环', files),
  赌注一致: countPhraseCopies('赌注一致', files),
  醒炕: countPhraseCopies('醒炕', files),
}

// --- 夹具：过一刀炸另一刀（须够长以触发正文侧赌注硬拦 ≥200 字） ---
const pad = (s: string, n: number) => {
  let out = s.replace(/\s+/g, '')
  while (out.length < n) out += '屋里风很大。他缓了口气。'
  return out
}

const thinHate = pad([
  '“开门！秦建国你个懒骨头，太阳照屁股了还装死呢！”门板被踹得砰砰响。',
  '秦建国一下睁了眼。头顶是发黑的房梁，北风从墙缝里钻进来，刀子似的刮脸。',
  '土炕破席，他撑起来，脑子轰地灌进二十多年记忆。',
].join(''), 220)

const stakeMismatch = pad([
  '“开门！欠我三块钱今天必须还，不还卸门板，西偏房透风冻死你们！”秦卫东踹门闯进来。',
  '秦建国坐起：“三天内连本带利还清。”',
  '秦卫东冷笑：“三日后我来卸门。今日初七，拢共三天。”',
  '秦建国扫过墙角柴油机油嘴柱塞：“这机子我识得，缺的是旧铜套那一环。”',
  '弟妹缩在炕尾，老娘瞎眼摸黑，爹瘫在里屋。',
].join(''), 220)

const stakeOkPressure = pad([
  '“开门！欠队里120块工分债不还，今天把后罩房收走，全家滚出去！”秦德东踹门闯进来，字据一甩。',
  '秦建国一脚踩下炕沿堵门：“字据拿来。没写后罩房归你，当着赵队长念。懒汉二流子的账我认，房你收不走。”',
  '他扫过墙角报废柴油机，油嘴柱塞缸垫一路排开：“三天，今日初五到初八拢共三天，机子修好抵债。”',
  '缺的是肯作证的人那一环。秦德东脸一白，骂着退了出去。',
].join(''), 220)

const wakeHeavy = readFileSync(join(process.cwd(), 'scripts/fixtures/appeal-manual-ch1.txt'), 'utf8')

const rows: Row[] = [
  { name: '虚恨+醒炕泄压', codes: hardCodes(thinHate), ok: false },
  { name: '三块+卸门急', codes: hardCodes(stakeMismatch), ok: false },
  { name: '120块+动作震慑标杆向', codes: hardCodes(stakeOkPressure), ok: true },
  { name: 'fixture醒炕盘点长稿', codes: hardCodes(wakeHeavy), ok: false },
]

const emptyGates = Object.fromEntries(
  DRAMA_GATE_CODES.map((c) => [c, { level: '弱' as const, note: '' }]),
) as ChapterCraftResult['drama_gates']

const craftStub: ChapterCraftResult = {
  passed: false,
  score: 40,
  min_score: 70,
  functions_hit: 0,
  dimensions: {},
  conflicts: ['开篇吸引力不足'],
  summary: 'fail',
  compliance_veto: false,
  compliance_reasons: [],
  tags: {},
  content_hash: 'diag',
  checked_at: new Date().toISOString(),
  drama_gates: {
    ...emptyGates,
    opening_promise: { level: '无', note: 'L1 hard' },
  },
  drama_gate_passed: false,
  soft_alerts: [],
  appeal: {
    layer: 'appeal',
    passed: false,
    summary: 'fail',
    dimensions: [],
    checked_at: new Date().toISOString(),
  },
}

const fixPrompt = buildChapterCraftFixPrompt('【原写作说明】写第1章', {
  ...craftStub,
  appeal: {
    ...craftStub.appeal!,
    dimensions: listOpeningAppealHardFails(thinHate, 1).map((h) => ({
      code: h.code,
      level: '无' as const,
      passed: false,
      message: h.message,
    })),
  },
})

const fixLen = [...fixPrompt].length
const fixBan = banCount(fixPrompt)
const fixHasAttractBlock = /吸引力硬修/.test(fixPrompt)
const fixSingleCode = /本轮只修最高优先级一码/.test(fixPrompt)
const fixNoFullEnum = !/1b\. 赌注一致[\s\S]*2\. 四拍[\s\S]*3\. 删/.test(fixPrompt)
const proseHasSSot = WEBNOVEL_CHAPTER_PROSE_GUIDE.includes(EMOTION_CORE_CONTRACT_VERSION)
const hintHasSSot = NOVEL_OUTLINE_STRUCTURE_HINT.includes(EMOTION_CORE_CONTRACT_VERSION)
const singleCodeSample = buildAppealSingleCodeFixBlock({
  hardFails: [
    { code: 'hate_thin_decompress', message: 'm1' },
    { code: 'stakes_mismatch', message: 'm2' },
  ],
})
const singleCodeOk = singleCodeSample.includes('hate_thin_decompress')
  && !singleCodeSample.includes('本轮硬拦【stakes_mismatch】')
  && singleCodeSample.includes('其余')

const ssotCandidates = Object.entries(phraseHits).filter(([, n]) => n >= 3)

const stakeCodes = rows[1]!.codes
const thinCodes = rows[0]!.codes
const tradeoffShown =
  thinCodes.includes('hate_thin_decompress')
  && (stakeCodes.includes('stakes_mismatch') || !!detectStakesMismatchText(
    '欠他的三块钱今天必须还，不还就把西偏房的门板卸走抵账，透风冻死人。三日后卸门。',
  ))
  && rows[2]!.codes.length === 0

/** 落地成功：SSOT 已接线 + craft 单码 + 夹具仍可区分好坏 */
const landed = proseHasSSot
  && hintHasSSot
  && fixSingleCode
  && fixNoFullEnum
  && fixHasAttractBlock
  && singleCodeOk
  && tradeoffShown
  && APPEAL_L1_FREEZE.includes('冻结')

const report = {
  verdict: landed ? 'SSOT_LANDED' : 'NOT_LANDED',
  meaning: landed
    ? 'SSOT 已落地：版本串进 prose/defaults；craft 单码硬修；夹具互斥仍成立；L1 冻结声明存在'
    : 'SSOT 落地检查未通过',
  metrics: {
    proseGuideBanHits: proseBans,
    outlineHintBanHits: hintBans,
    emotionHardRuleBanHits: emotionBans,
    craftFileBanHits: craftFixBans,
    emotionPhases: [...EMOTION_BEAT_PHASES],
    emotionHardRulesChars: [...hardRules].length,
    craftFixPromptChars: fixLen,
    craftFixBanHits: fixBan,
    craftFixSingleCode: fixSingleCode,
    craftFixNoFullEnum: fixNoFullEnum,
    proseHasSSot,
    hintHasSSot,
    phraseCopiesAcrossSixFiles: phraseHits,
    ssotCandidates: ssotCandidates.map(([k, n]) => `${k}×${n}`),
  },
  fixtureMatrix: rows.map((r) => ({
    name: r.name,
    hardFailCodes: r.codes,
    expectClean: r.ok,
    clean: r.codes.length === 0,
    matchExpect: r.ok ? r.codes.length === 0 : r.codes.length > 0,
  })),
  stakesTextProbe: {
    threeYuanDoor: detectStakesMismatchText(
      '欠他的三块钱今天必须还，不还就把西偏房的门板卸走抵账，透风冻死人。三日后卸门。',
    ),
    bigDebtDoor: detectStakesMismatchText(
      '欠队里一百二十块工分债，今天不还就把西偏房收走，全家滚出去。',
    ),
  },
  evidenceFlags: {
    tradeoffShown,
    proseHasSSot,
    hintHasSSot,
    fixSingleCode,
    fixNoFullEnum,
    singleCodeOk,
  },
}

console.log(JSON.stringify(report, null, 2))

if (!rows.every((r) => (r.ok ? r.codes.length === 0 : r.codes.length > 0))) {
  console.error('FIXTURE_EXPECTATION_MISMATCH')
  process.exit(2)
}
if (!landed) {
  console.error('SSOT_NOT_LANDED')
  process.exit(1)
}
console.log('SSOT_LANDED_OK')
