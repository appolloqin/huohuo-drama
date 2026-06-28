/**
 * 小说一致性本地审校：硬审（高精度结构化）+ 规则审（软提示，不单独拦截）
 *
 * 硬审：境界结构化字段、伤势关键词 — 误报低，可直接拦截
 * 规则审：修辞/对话境界疑点、物理表述 — 仅作 LLM 参考，不拦截
 * 模型审：人名、跨章剧情、境界语义补审、复杂语义 — 见 novel-continuity-check.ts
 */
import type { NovelContinuityFields } from '../../common/novel/novel-continuity-state.js'
import {
  extractAllRealmMentions,
  dominantRealmMention,
  firstRealmMention,
  normalizeRealmSystem,
  sameRealmSystem,
  type ParsedRealmMention,
} from '../../common/novel/novel-realm-utils.js'

export type AuditConflict = {
  layer: 'hard' | 'rule'
  rule: string
  message: string
}

export type LocalAuditResult = {
  hard: AuditConflict[]
  rule: AuditConflict[]
}

type RealmMention = ParsedRealmMention & {
  layer: 'narration' | 'dialogue'
  sentence: string
  isRhetoricalTarget: boolean
}

const CURRENT_REALM_CUES = /(?:已是|停留在|卡在|不过|仅为|只是|仅有|处于|已达|到了|便是|乃是|区区|才)/

const TARGET_REALM_CUES = /(?:连|尚|还|连.*?都|难以|无法|不能|未曾|未到|达不到|突破不了|到不了|未至)/

const INJURY_SEVERE = /重伤|濒死|昏迷|骨折|残废|经脉尽断|血肉模糊|奄奄一息|命悬一线|内息紊乱|吐血不止/
const INJURY_MILD = /轻伤|擦伤|淤青|小伤/
const INJURY_HEALED = /毫发无伤|完好无损|健步如飞|生龙活虎|毫无损伤|精神奕奕|伤势痊愈|已无碍|全愈|痊愈|伤愈|已无大碍|恢复如初|体表无(?:明显)?伤|无疤痕/

function checkProsePhysics(content: string): AuditConflict[] {
  const out: AuditConflict[] = []
  for (const sentence of splitSentences(content)) {
    if (/脸|面容|面孔|身影|姿态/.test(sentence) && /回荡|回响/.test(sentence)) {
      out.push({
        layer: 'rule',
        rule: 'prose_physics',
        message: `表述不当：「${sentence.trim().slice(0, 50)}…」——脸/身影不能回荡，应改为「如在耳畔」「浮现眼前」等`,
      })
    }
  }
  return out
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?…\n])/).map(s => s.trim()).filter(Boolean)
}

function stripDialogue(text: string): { narration: string, dialogues: string[] } {
  const dialogues: string[] = []
  const patterns = [/「([^」]+)」/g, /"([^"]+)"/g, /"([^"]+)"/g, /'([^']+)'/g]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m[1]?.trim()) dialogues.push(m[1].trim())
    }
  }
  const narration = text
    .replace(/「[^」]*」/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']*'/g, ' ')
  return { narration, dialogues }
}

const BREAKTHROUGH_CUES = /突破|晋升|进阶|更上一层|境界松动|冲关|破境|迈入|踏入|达到|成功|瓶颈|冲破/

/** 合法「境界下降」叙事：重修、废修为、散功、打落等 */
const REALM_DOWNGRADE_CUES = /重修|重练|重新(?:修炼|修行|练功|筑基)|从头(?:再|修|练|来)|再起|重(?:返|新).{0,8}(?:修炼|修行|练功)|废(?:去|掉|除|弃)?(?:修为|丹田|灵根|气海|武功|功力)|散功|打落|击落|贬(?:至|为|落)|跌落|倒退|回落|降为|降回|降至|沦为|修为(?:尽|全)失|功力(?:大|全)?(?:损|失|废)|境界(?:大|全)?(?:跌|掉|损|废|落|退)|跌境|退(?:回|到|至|境)|坠落|被打(?:回|落)|遭(?:劫|创|重?创|反噬).{0,20}(?:跌|废|散|损)|自废|自毁(?:丹田|修为|灵根)|削(?:去|掉).{0,8}(?:修为|境界|功力)|丹田(?:碎|破|废)|灵根(?:断|毁|废)|压制(?:在|到|至|为)|伪装(?:成|为)|刻意(?:压|隐藏)/

function dialogueAboutProtagonist(sentence: string): boolean {
  if (/他|她|此人|那人|那厮|对方|其人|某某|长老|师兄|师弟|师妹|师姐/.test(sentence)
    && !/你|您|自己|自身|本少|本座|老子|在下|我[^们]|贫道/.test(sentence)) {
    return false
  }
  return /你|您|自己|自身|本少|本座|老子|在下|我[^们]|贫道|你这|你还/.test(sentence)
}

function mentionInBreakthroughZone(fullNarration: string, raw: string, tailRatio = 0.35): boolean {
  const idx = fullNarration.lastIndexOf(raw)
  if (idx < 0) return false
  return idx >= fullNarration.length * (1 - tailRatio)
}

function hasBreakthroughCueNear(fullText: string, raw: string, window = 80): boolean {
  let idx = fullText.indexOf(raw)
  while (idx >= 0) {
    const slice = fullText.slice(Math.max(0, idx - window), idx + raw.length + window)
    if (BREAKTHROUGH_CUES.test(slice)) return true
    idx = fullText.indexOf(raw, idx + 1)
  }
  return false
}

/** 章内「前低后高」升级弧线（含突破/冲关等描写）— 合法，不硬拦 */
function isRealmUpgradeArc(
  mentions: RealmMention[],
  fullNarration: string,
  system: string,
): boolean {
  const factual = mentions.filter(m => normalizeRealmSystem(m.system) === system && !m.isRhetoricalTarget)
  if (factual.length < 2) return false

  const levels = [...new Set(factual.map(m => m.level))].sort((a, b) => a - b)
  const minL = levels[0]!
  const maxL = levels[levels.length - 1]!
  if (maxL <= minL) return false

  let firstMinIdx = fullNarration.length
  let lastMaxIdx = -1
  for (const m of factual) {
    const idx = fullNarration.indexOf(m.raw)
    if (idx < 0) continue
    if (m.level === minL) firstMinIdx = Math.min(firstMinIdx, idx)
    if (m.level === maxL) lastMaxIdx = Math.max(lastMaxIdx, idx)
  }
  if (lastMaxIdx <= firstMinIdx) return false

  const span = fullNarration.slice(firstMinIdx, lastMaxIdx + 160)
  if (BREAKTHROUGH_CUES.test(span)) return true

  if (firstMinIdx < fullNarration.length * 0.6 && BREAKTHROUGH_CUES.test(fullNarration)) return true

  return factual.some(m => m.level === maxL && (
    mentionInBreakthroughZone(fullNarration, m.raw, 0.45)
    || hasBreakthroughCueNear(fullNarration, m.raw, 160)
  ))
}

/** 旁白叙述顺序中出现「先高后低」— 真倒退，可硬拦 */
function hasIntraChapterRealmRegression(
  mentions: RealmMention[],
  fullNarration: string,
  system: string,
): boolean {
  const ordered = mentions
    .filter(m => normalizeRealmSystem(m.system) === system && !m.isRhetoricalTarget)
    .map(m => ({ level: m.level, idx: fullNarration.indexOf(m.raw) }))
    .filter(m => m.idx >= 0)
    .sort((a, b) => a.idx - b.idx)

  if (ordered.length < 2) return false

  let peak = ordered[0]!.level
  for (const m of ordered) {
    if (m.level < peak) return true
    if (m.level > peak) peak = m.level
  }
  return false
}

function ledgerHintsDowngrade(fields?: NovelContinuityFields | null): boolean {
  if (!fields) return false
  const blob = [
    fields.reminder, fields.actions, fields.delta, fields.realm, fields.abilities, fields.knowledge,
  ].filter(Boolean).join('\n')
  return REALM_DOWNGRADE_CUES.test(blob)
}

function hasRealmDowngradeCueInText(text: string): boolean {
  return REALM_DOWNGRADE_CUES.test(text)
}

function hasRealmDowngradeCueNear(fullText: string, raw: string, window = 200): boolean {
  let idx = fullText.indexOf(raw)
  while (idx >= 0) {
    const slice = fullText.slice(Math.max(0, idx - window), idx + raw.length + window)
    if (REALM_DOWNGRADE_CUES.test(slice)) return true
    idx = fullText.indexOf(raw, idx + 1)
  }
  return false
}

/** 境界下降是否有叙事依据（重修/废修为/散功等）— 有则不应硬拦 */
function isLegitimateRealmDowngrade(args: {
  narration: string
  contextSpan?: string
  lowerRealmRaw?: string
  expectedFields?: NovelContinuityFields | null
}): boolean {
  if (ledgerHintsDowngrade(args.expectedFields)) return true
  if (args.contextSpan && hasRealmDowngradeCueInText(args.contextSpan)) return true
  if (hasRealmDowngradeCueInText(args.narration.slice(0, Math.min(args.narration.length, 2800)))) return true
  if (args.lowerRealmRaw && hasRealmDowngradeCueNear(args.narration, args.lowerRealmRaw)) return true
  return false
}

/** 章内「先高后低」且伴随重修/废修为等描写 — 合法 */
function isRealmDowngradeArc(
  mentions: RealmMention[],
  fullNarration: string,
  system: string,
): boolean {
  const factual = mentions.filter(m => normalizeRealmSystem(m.system) === system && !m.isRhetoricalTarget)
  if (factual.length < 2) return false

  const levels = [...new Set(factual.map(m => m.level))].sort((a, b) => a - b)
  const minL = levels[0]!
  const maxL = levels[levels.length - 1]!
  if (maxL <= minL) return false

  let firstHighIdx = fullNarration.length
  let lastLowIdx = -1
  for (const m of factual) {
    const idx = fullNarration.indexOf(m.raw)
    const lastIdx = fullNarration.lastIndexOf(m.raw)
    if (idx < 0) continue
    if (m.level === maxL) firstHighIdx = Math.min(firstHighIdx, idx)
    if (m.level === minL) lastLowIdx = Math.max(lastLowIdx, lastIdx)
  }
  if (lastLowIdx <= firstHighIdx) return false

  const span = fullNarration.slice(firstHighIdx, lastLowIdx + 200)
  if (REALM_DOWNGRADE_CUES.test(span)) return true
  if (REALM_DOWNGRADE_CUES.test(fullNarration)) return true

  return factual.some(m => m.level === minL && hasRealmDowngradeCueNear(fullNarration, m.raw))
}

function realmRegressionAudit(args: {
  rule: string
  hardMessage: string
  ruleMessage: string
  narration: string
  contextSpan?: string
  lowerRealmRaw?: string
  expectedFields?: NovelContinuityFields | null
}): AuditConflict {
  if (isLegitimateRealmDowngrade(args)) {
    return { layer: 'rule', rule: args.rule, message: args.ruleMessage }
  }
  return { layer: 'hard', rule: args.rule, message: args.hardMessage }
}

function isRhetoricalTarget(sentence: string, raw: string): boolean {
  const idx = sentence.indexOf(raw)
  const window = idx >= 0 ? sentence.slice(Math.max(0, idx - 12), idx + raw.length + 16) : sentence
  if (TARGET_REALM_CUES.test(window)) return true
  if (CURRENT_REALM_CUES.test(window)) return false
  return false
}

/** 旁白中的假设/伪装表述（若…压回二层伪装）不计入当前境界 */
function isHypotheticalNarration(sentence: string, raw: string): boolean {
  if (/若|假如|倘若|万一|就算|即便|假设|一旦|要是|假使|倘若|哪怕/.test(sentence)
    && /压回|收回|伪装|装作|掩饰|强行|倘若|万一/.test(sentence)) {
    return true
  }
  const idx = sentence.indexOf(raw)
  const before = idx >= 0 ? sentence.slice(Math.max(0, idx - 48), idx) : ''
  if (/若|假如|倘若|万一|就算|即便|假设|一旦|要是|假使|哪怕/.test(before)) return true
  if (/伪装(?:态|境界|修为|层|成)|假扮|装作(?:的)?/.test(sentence) && sentence.includes(raw)) return true
  return false
}

function extractRealmMentions(text: string, layer: 'narration' | 'dialogue'): RealmMention[] {
  const out: RealmMention[] = []
  for (const sentence of splitSentences(text)) {
    for (const mention of extractAllRealmMentions(sentence)) {
      out.push({
        ...mention,
        layer,
        sentence,
        isRhetoricalTarget: layer === 'dialogue'
          ? isRhetoricalTarget(sentence, mention.raw)
          : isHypotheticalNarration(sentence, mention.raw),
      })
    }
  }
  return out
}

/** 章首/章末/跨章衔接：含引号内自述境界（如「淬体八层……」），不因 stripDialogue 漏检 */
function extractBoundaryRealmMentions(text: string): RealmMention[] {
  const out: RealmMention[] = []
  for (const sentence of splitSentences(text)) {
    for (const mention of extractAllRealmMentions(sentence)) {
      out.push({
        ...mention,
        layer: 'narration',
        sentence,
        isRhetoricalTarget: false,
      })
    }
  }
  return out
}

function dominantRealm(mentions: RealmMention[]): RealmMention | null {
  const factual = mentions.filter(m => !m.isRhetoricalTarget)
  if (!factual.length) return null
  const counts = new Map<string, { count: number, mention: RealmMention }>()
  for (const m of factual) {
    const key = `${normalizeRealmSystem(m.system)}:${m.level}:${m.kind}`
    const cur = counts.get(key)
    if (cur) cur.count += 1
    else counts.set(key, { count: 1, mention: m })
  }
  let best: { count: number, mention: RealmMention } | null = null
  for (const v of counts.values()) {
    if (!best || v.count > best.count || (v.count === best.count && v.mention.level > best.mention.level)) {
      best = v
    }
  }
  return best?.mention ?? null
}

function realmsBySystem(mentions: RealmMention[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()
  for (const m of mentions.filter(x => !x.isRhetoricalTarget)) {
    const sys = normalizeRealmSystem(m.system)
    if (!map.has(sys)) map.set(sys, new Set())
    map.get(sys)!.add(m.level)
  }
  return map
}

function extractRealmFromField(field?: string): RealmMention | null {
  if (!field?.trim()) return null
  const mention = dominantRealmMention(field) ?? firstRealmMention(field)
  if (!mention) return null
  return {
    ...mention,
    layer: 'narration',
    sentence: field,
    isRhetoricalTarget: false,
  }
}

function injurySeverity(text: string): 'severe' | 'mild' | 'none' | 'healed' | 'unknown' {
  const t = text.replace(/\s+/g, '')
  // 账本「无（…）」或已愈表述：当前无伤，勿因历史「重伤」二字误判
  if (/^无[（(]?/.test(t)) return 'none'
  if (/全愈|痊愈|伤愈|已无大碍|恢复(?:如初|完毕)|体表无疤|无疤痕|不再.*重伤|伤已(?:愈|愈)/.test(t)) return 'healed'
  if (/重伤/.test(t) && /全愈|痊愈|已无|不再|伤已|无疤痕|体表无/.test(t)) return 'healed'
  if (INJURY_HEALED.test(t)) return 'healed'
  if (INJURY_SEVERE.test(t)) return 'severe'
  if (INJURY_MILD.test(t)) return 'mild'
  if (/无伤|无碍/.test(t)) return 'none'
  return 'unknown'
}

function checkOpeningRealmVsLedger(
  openingMention: RealmMention | null,
  expected: RealmMention,
  openingText: string,
  narration: string,
  expectedFields?: NovelContinuityFields | null,
): AuditConflict[] {
  const out: AuditConflict[] = []

  if (openingMention
    && sameRealmSystem(openingMention.system, expected.system)
    && openingMention.level < expected.level) {
    const item = realmRegressionAudit({
      rule: 'inter_chapter_realm_regression',
      hardMessage: `章初境界倒退：应对齐账本「${expected.raw}」，章初叙述为「${openingMention.raw}」（不得低于上章末状态）`,
      ruleMessage: `章初为「${openingMention.raw}」，低于账本「${expected.raw}」——若为重修/废修为/跌落，请确认正文已交代`,
      narration,
      contextSpan: openingText,
      lowerRealmRaw: openingMention.raw,
      expectedFields,
    })
    out.push(item)
  }

  if (openingMention
    && sameRealmSystem(openingMention.system, expected.system)
    && openingMention.level > expected.level
    && !BREAKTHROUGH_CUES.test(openingText.slice(0, Math.min(openingText.length, 1500)))) {
    out.push({
      layer: 'rule',
      rule: 'inter_chapter_realm_opening_upgrade',
      message: `章初已为「${openingMention.raw}」，高于账本「${expected.raw}」——若为上章末突破延续则合理，请核对`,
    })
  }
  return out
}

function checkInjuryConsistency(
  injuriesField: string | undefined,
  narration: string,
): AuditConflict[] {
  const out: AuditConflict[] = []
  if (!injuriesField?.trim()) return out
  const ledgerSev = injurySeverity(injuriesField)
  if (ledgerSev !== 'severe' && ledgerSev !== 'mild') return out

  const tail = narration.slice(-Math.min(narration.length, 3000))
  const head = narration.slice(0, Math.min(narration.length, 1500))
  const scan = `${head}\n${tail}`
  const textSev = injurySeverity(scan)

  if (ledgerSev === 'severe' && textSev === 'healed') {
    out.push({
      layer: 'hard',
      rule: 'inter_chapter_injury',
      message: `章间伤势冲突：状态账本记载「${injuriesField.trim().slice(0, 80)}」，但正文出现「毫发无伤/健步如飞」等与重伤矛盾的表述`,
    })
  }
  if (ledgerSev === 'severe' && /毫发无伤|完好无损|精神奕奕|毫无损伤/.test(scan)) {
    if (!out.length) {
      out.push({
        layer: 'hard',
        rule: 'inter_chapter_injury',
        message: `章间伤势冲突：状态账本为重伤，正文却写主角状态完好（须交代疗伤或降级伤势）`,
      })
    }
  }
  return out
}

/** 章内旁白境界 — 硬审仅拦「先高后低」；合法升级弧线放行 */
function checkIntraChapterRealmNarration(
  narrationMentions: RealmMention[],
  fullNarration: string,
  expectedFields?: NovelContinuityFields | null,
): { hard: AuditConflict[], rule: AuditConflict[] } {
  const hard: AuditConflict[] = []
  const rule: AuditConflict[] = []

  for (const [system, levels] of realmsBySystem(narrationMentions)) {
    if (levels.size <= 1) continue

    if (isRealmUpgradeArc(narrationMentions, fullNarration, system)) continue
    if (isRealmDowngradeArc(narrationMentions, fullNarration, system)) continue

    if (hasIntraChapterRealmRegression(narrationMentions, fullNarration, system)) {
      const samples = narrationMentions
        .filter(m => normalizeRealmSystem(m.system) === system && !m.isRhetoricalTarget)
        .map(m => m.raw)
        .slice(0, 4)
      const lowMention = [...narrationMentions]
        .filter(m => normalizeRealmSystem(m.system) === system && !m.isRhetoricalTarget)
        .sort((a, b) => fullNarration.lastIndexOf(b.raw) - fullNarration.lastIndexOf(a.raw))[0]
      const item = realmRegressionAudit({
        rule: 'intra_chapter_realm_regression',
        hardMessage: `章内叙述境界倒退：旁白对「${system}」先高后低（如 ${[...new Set(samples)].join('、')}），须交代变故或统一境界`,
        ruleMessage: `旁白对「${system}」先高后低（${[...new Set(samples)].join('、')}）——若为重修/废修为/散功，请确认过程完整`,
        narration: fullNarration,
        lowerRealmRaw: lowMention?.raw,
        expectedFields,
      })
      if (item.layer === 'hard') hard.push(item)
      else rule.push(item)
      continue
    }

    const samples = narrationMentions
      .filter(m => normalizeRealmSystem(m.system) === system && !m.isRhetoricalTarget)
      .map(m => m.raw)
      .slice(0, 4)
    rule.push({
      layer: 'rule',
      rule: 'intra_chapter_realm_multi_level',
      message: `旁白对「${system}」出现多个层级（${[...new Set(samples)].join('、')}），若为章内突破/晋级则合理，请核对`,
    })
  }

  return { hard, rule }
}

/** 对话与旁白境界 — 规则审（修辞/语境复杂，不硬拦截） */
function checkIntraChapterRealmDialogue(
  narrationMentions: RealmMention[],
  dialogueMentions: RealmMention[],
): AuditConflict[] {
  const out: AuditConflict[] = []
  const narrDominant = dominantRealm(narrationMentions)
  if (!narrDominant) return out

  for (const dm of dialogueMentions) {
    if (!dialogueAboutProtagonist(dm.sentence)) continue

    if (dm.isRhetoricalTarget) {
      if (sameRealmSystem(dm.system, narrDominant.system) && dm.level <= narrDominant.level) {
        out.push({
          layer: 'rule',
          rule: 'intra_chapter_realm_dialogue',
          message: `旁白写主角为「${narrDominant.raw}」，对话「${dm.sentence.trim().slice(0, 60)}…」似在修辞性提及 ${dm.raw}，请核对是否矛盾`,
        })
      }
      continue
    }
    if (sameRealmSystem(dm.system, narrDominant.system) && dm.level !== narrDominant.level) {
      out.push({
        layer: 'rule',
        rule: 'intra_chapter_realm_dialogue',
        message: `旁白为「${narrDominant.raw}」，对话却陈述「${dm.raw}」（${dm.sentence.trim().slice(0, 50)}…），请核对是否矛盾`,
      })
    }
  }

  return out
}

export function runLocalContinuityAudit(args: {
  content: string
  chapterNumber: number
  expectedFields?: NovelContinuityFields | null
  prevChapterTail?: string
}): LocalAuditResult {
  const { content, chapterNumber, expectedFields, prevChapterTail } = args
  const trimmed = content.trim()
  if (!trimmed) return { hard: [], rule: [] }

  const { narration, dialogues } = stripDialogue(trimmed)
  const narrationMentions = extractRealmMentions(narration, 'narration')
  const dialogueMentions = dialogues.flatMap(d => extractRealmMentions(d, 'dialogue'))

  const intra = checkIntraChapterRealmNarration(narrationMentions, narration, expectedFields)
  const hard: AuditConflict[] = [...intra.hard]
  const rule: AuditConflict[] = [
    ...intra.rule,
    ...checkIntraChapterRealmDialogue(narrationMentions, dialogueMentions),
    ...checkProsePhysics(trimmed),
  ]

  const expectedRealm = extractRealmFromField(expectedFields?.realm)
  if (expectedRealm && chapterNumber >= 2) {
    const opening = trimmed.slice(0, Math.min(trimmed.length, 1200))
    const openingMention = dominantRealm(extractBoundaryRealmMentions(opening))
    for (const item of checkOpeningRealmVsLedger(openingMention, expectedRealm, opening, narration, expectedFields)) {
      if (item.layer === 'hard') hard.push(item)
      else rule.push(item)
    }

    const ending = trimmed.slice(-Math.min(trimmed.length, 1500))
    const endingMention = dominantRealm(extractBoundaryRealmMentions(ending))
    if (endingMention && endingMention.level < expectedRealm.level
      && sameRealmSystem(endingMention.system, expectedRealm.system)) {
      const item = realmRegressionAudit({
        rule: 'inter_chapter_realm_regression',
        hardMessage: `章末境界倒退：应对齐「${expectedRealm.raw}」，章末叙述为「${endingMention.raw}」，状态不应无故回落`,
        ruleMessage: `章末为「${endingMention.raw}」，低于账本「${expectedRealm.raw}」——若为重修/废修为/散功，请确认已交代`,
        narration,
        contextSpan: ending,
        lowerRealmRaw: endingMention.raw,
        expectedFields,
      })
      if (item.layer === 'hard') hard.push(item)
      else rule.push(item)
    } else if (endingMention && endingMention.level > expectedRealm.level
      && sameRealmSystem(endingMention.system, expectedRealm.system)
      && !isRealmUpgradeArc(narrationMentions, narration, normalizeRealmSystem(expectedRealm.system))
      && !BREAKTHROUGH_CUES.test(narration)) {
      rule.push({
        layer: 'rule',
        rule: 'inter_chapter_realm_ending_upgrade',
        message: `章末为「${endingMention.raw}」，高于账本「${expectedRealm.raw}」——若为章内突破请确认过程完整`,
      })
    }
  }

  if (prevChapterTail?.trim() && chapterNumber >= 2) {
    const curStart = trimmed.slice(0, Math.min(trimmed.length, 800))
    const curStartRealmRaw = dominantRealm(extractBoundaryRealmMentions(curStart))
    const alignedToLedger = expectedRealm && curStartRealmRaw
      && sameRealmSystem(curStartRealmRaw.system, expectedRealm.system)
      && curStartRealmRaw.level === expectedRealm.level

    if (!alignedToLedger && curStartRealmRaw) {
      const prevTail = prevChapterTail.slice(-800)
      const prevEndRealm = dominantRealm(extractBoundaryRealmMentions(prevTail))
      const curStartRealm = curStartRealmRaw
      if (prevEndRealm
        && sameRealmSystem(prevEndRealm.system, curStartRealm.system)
        && prevEndRealm.level !== curStartRealm.level) {
        if (curStartRealm.level > prevEndRealm.level) {
          rule.push({
            layer: 'rule',
            rule: 'inter_chapter_realm_prev_tail_upgrade',
            message: `上章结尾「${prevEndRealm.raw}」，本章开头「${curStartRealm.raw}」——若为跨章突破/衔接请确认已交代`,
          })
        } else {
          const termMix = prevEndRealm.kind === 'peak' && curStartRealm.kind === 'layer'
          const item = realmRegressionAudit({
            rule: termMix ? 'inter_chapter_realm_terminology' : 'inter_chapter_realm_prev_tail',
            hardMessage: termMix
              ? `跨章境界表述冲突：上章结尾为「${prevEndRealm.raw}」，本章开头却写「${curStartRealm.raw}」——同一体系内「圆满/巅峰」高于「X层」，不得无故从圆满降为层数表述`
              : `跨章衔接倒退：上章结尾旁白为「${prevEndRealm.raw}」，本章开头旁白为「${curStartRealm.raw}」，须承接或交代变故`,
            ruleMessage: `上章结尾「${prevEndRealm.raw}」，本章开头「${curStartRealm.raw}」——若为重修/废修为/跨章跌落，请确认已交代`,
            narration,
            contextSpan: curStart,
            lowerRealmRaw: curStartRealm.raw,
            expectedFields,
          })
          if (item.layer === 'hard') hard.push(item)
          else rule.push(item)
        }
      }
    }
  }

  hard.push(...checkInjuryConsistency(expectedFields?.injuries, narration))

  const dedupe = (items: AuditConflict[]) => {
    const seen = new Set<string>()
    return items.filter(c => {
      if (seen.has(c.message)) return false
      seen.add(c.message)
      return true
    })
  }

  return { hard: dedupe(hard), rule: dedupe(rule) }
}

export function formatHardAuditBlock(hard: AuditConflict[]): string {
  if (!hard.length) return ''
  return [
    '【硬审 — 下列为结构化硬伤（合法突破/晋级、重修/废修为/散功等境界下降不算）】',
    ...hard.map(c => `- [${c.rule}] ${c.message}`),
  ].join('\n')
}

export function formatRuleAuditBlock(rule: AuditConflict[]): string {
  if (!rule.length) return ''
  return [
    '【规则审 — 下列为软提示，仅在有明确正文矛盾时才写入 conflicts】',
    ...rule.map(c => `- [${c.rule}] ${c.message}`),
  ].join('\n')
}
