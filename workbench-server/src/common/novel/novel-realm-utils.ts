/**
 * 网文境界表述解析 — 通用体系名（炼气/筑基/金丹/…）+ 数字 + 单位（层/重/阶/期/境）
 */

export const REALM_UNIT_SUFFIX = '重|层|阶|期|境'

export const REALM_PEAK_SUFFIX = '圆满|大圆满|巅峰|极境|顶峰'

/** 体系名 1～8 字 + 层级数字 + 单位；体系名由正文/账本动态捕获，非固定「炼气」 */
export const REALM_MENTION_RE = new RegExp(
  `([\\u4e00-\\u9fa5]{1,8})([一二三四五六七八九十百千万两\\d]+)(${REALM_UNIT_SUFFIX})`,
  'g',
)

/** 大境内的「圆满/巅峰」等顶峰表述（如淬体境圆满）；体系名 1～4 字且前非汉字，避免「普通的淬体境巅峰」误匹配 */
export const REALM_PEAK_RE = new RegExp(
  `(?<![\\u4e00-\\u9fa5])([\\u4e00-\\u9fa5]{1,4})(?:境)?(${REALM_PEAK_SUFFIX})`,
  'g',
)

/** 归一化层级：同一 major 境内，圆满/巅峰 高于任意「X层/X重」 */
export const PEAK_REALM_LEVEL = 90

/** 比对用：去掉体系名末尾「境」 */
export function normalizeRealmSystem(system: string): string {
  return system.replace(/境$/u, '').trim()
}

export function sameRealmSystem(a: string, b: string): boolean {
  return normalizeRealmSystem(a) === normalizeRealmSystem(b)
}

const CN_DIGIT: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000,
}

export type ParsedRealm = {
  system: string
  level: number
  raw: string
  unit: string
}

export type ParsedRealmKind = 'layer' | 'peak'

export type ParsedRealmMention = ParsedRealm & {
  kind: ParsedRealmKind
}

export function parseChineseNumber(raw: string): number | null {
  const t = raw.trim()
  if (/^\d+$/.test(t)) return Number(t)
  if (t.length === 1 && CN_DIGIT[t] != null) return CN_DIGIT[t]
  if (t === '十') return 10
  if (t.startsWith('十') && t.length === 2 && CN_DIGIT[t[1]!] != null) return 10 + CN_DIGIT[t[1]!]!
  if (t.endsWith('十') && t.length === 2 && CN_DIGIT[t[0]!] != null) return CN_DIGIT[t[0]!]! * 10
  if (t.includes('十')) {
    const [a, b] = t.split('十')
    const hi = a ? (CN_DIGIT[a] ?? Number(a)) : 1
    const lo = b ? (CN_DIGIT[b] ?? Number(b)) : 0
    if (Number.isFinite(hi) && Number.isFinite(lo)) return hi * 10 + lo
  }
  const mapped = [...t].map(ch => CN_DIGIT[ch]).filter(n => n != null)
  if (mapped.length === 1) return mapped[0]!
  return null
}

export function formatChineseLevel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return String(n)
  if (n <= 10) return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n]!
  if (n < 20) {
    const ones = n - 10
    return ones === 0 ? '十' : `十${formatChineseLevel(ones)}`
  }
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return `${formatChineseLevel(tens)}十${ones ? formatChineseLevel(ones) : ''}`
  }
  return String(n)
}

export function buildRealmToken(system: string, level: number, unit: string): string {
  return `${system}${formatChineseLevel(level)}${unit}`
}

export function parseRealmToken(raw: string): ParsedRealm | null {
  const t = raw.trim()
  const peak = t.match(new RegExp(`^([\\u4e00-\\u9fa5]{1,8})(?:境)?(${REALM_PEAK_SUFFIX})$`))
  if (peak) {
    return {
      system: peak[1]!,
      level: PEAK_REALM_LEVEL,
      raw: peak[0],
      unit: peak[2]!,
    }
  }
  const m = t.match(new RegExp(`^([\\u4e00-\\u9fa5]{1,8})([一二三四五六七八九十百千万两\\d]+)(${REALM_UNIT_SUFFIX})$`))
  if (!m) return null
  const level = parseChineseNumber(m[2]!)
  if (level == null) return null
  return { system: m[1]!, level, raw: m[0], unit: m[3]! }
}

function collectRealmMentionsInText(text: string): ParsedRealmMention[] {
  const spans: { start: number, end: number, mention: ParsedRealmMention }[] = []

  REALM_MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = REALM_MENTION_RE.exec(text)) !== null) {
    const level = parseChineseNumber(m[2]!)
    if (level == null) continue
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      mention: { system: m[1]!, level, raw: m[0], unit: m[3]!, kind: 'layer' },
    })
  }

  REALM_PEAK_RE.lastIndex = 0
  while ((m = REALM_PEAK_RE.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (spans.some(s => start >= s.start && start < s.end)) continue
    spans.push({
      start,
      end,
      mention: {
        system: m[1]!,
        level: PEAK_REALM_LEVEL,
        raw: m[0],
        unit: m[2]!,
        kind: 'peak',
      },
    })
  }

  return spans.sort((a, b) => a.start - b.start).map(s => s.mention)
}

/** 从一段文本中取第一个可解析的境界词（用于账本 realm 字段） */
export function firstRealmMention(text: string): ParsedRealmMention | null {
  return collectRealmMentionsInText(text)[0] ?? null
}

/** 取文本中层级最高的境界表述（章末/章初比对用） */
export function dominantRealmMention(text: string): ParsedRealmMention | null {
  const mentions = collectRealmMentionsInText(text)
  if (!mentions.length) return null
  return mentions.reduce((best, cur) => {
    if (!sameRealmSystem(cur.system, best.system)) {
      return cur.level > best.level ? cur : best
    }
    return cur.level >= best.level ? cur : best
  })
}

export function extractRealmMentionsFromText(text: string): ParsedRealm[] {
  return collectRealmMentionsInText(text)
}

export function extractAllRealmMentions(text: string): ParsedRealmMention[] {
  return collectRealmMentionsInText(text)
}

export function compareRealmLevels(a: ParsedRealmMention, b: ParsedRealmMention): number {
  if (!sameRealmSystem(a.system, b.system)) return 0
  return a.level - b.level
}

export function isRealmRegression(prev: ParsedRealmMention, next: ParsedRealmMention): boolean {
  return sameRealmSystem(prev.system, next.system) && next.level < prev.level
}

/** 将同体系、同单位且低于 expected 的表述抬升到 expected（体系名来自 expected，非写死） */
export function replaceRegressiveRealmsInSpan(text: string, expected: ParsedRealm): string {
  REALM_MENTION_RE.lastIndex = 0
  return text.replace(REALM_MENTION_RE, (match, system, numStr, unit) => {
    if (system !== expected.system || unit !== expected.unit) return match
    const level = parseChineseNumber(numStr)
    if (level == null || level >= expected.level) return match
    return buildRealmToken(expected.system, expected.level, expected.unit)
  })
}

/** 在指定区间内，把低于 expected 的同体系境界变体一并抬升（支持层/重/阶/期/境） */
export function liftLowerRealmsInSpan(text: string, expected: ParsedRealm): string {
  let span = replaceRegressiveRealmsInSpan(text, expected)
  for (let lv = 1; lv < expected.level; lv += 1) {
    const low = buildRealmToken(expected.system, lv, expected.unit)
    const high = buildRealmToken(expected.system, expected.level, expected.unit)
    if (span.includes(low)) span = span.split(low).join(high)
  }
  return span
}

export function parseRealmFixFromConflict(conflict: string): {
  expectedRaw: string
  wrongRaw: string
  scope: 'ending' | 'full'
} | null {
  let m = conflict.match(/章末境界倒退：应对齐「([^」]+)」，章末叙述为「([^」]+)」/)
  if (m?.[1] && m[2]) return { expectedRaw: m[1], wrongRaw: m[2], scope: 'ending' }
  m = conflict.match(/叙述为「([^」]+)」，但应对齐的状态账本为「([^」]+)」/)
  if (m?.[1] && m[2]) return { expectedRaw: m[2], wrongRaw: m[1], scope: 'full' }
  m = conflict.match(/旁白写主角为「([^」]+)」/)
  if (m?.[1]) {
    const ledger = conflict.match(/应对齐「([^」]+)」|账本为「([^」]+)」|状态账本为「([^」]+)」/)
    const expected = ledger?.[1] || ledger?.[2] || ledger?.[3]
    if (expected) return { expectedRaw: expected, wrongRaw: m[1], scope: 'full' }
  }
  m = conflict.match(/旁白为「([^」]+)」，对话/)
  if (m?.[1]) {
    const ledger = conflict.match(/应对齐「([^」]+)」|账本为「([^」]+)」/)
    const expected = ledger?.[1] || ledger?.[2]
    if (expected) return { expectedRaw: expected, wrongRaw: m[1], scope: 'full' }
  }
  m = conflict.match(/应对齐「([^」]+)」/)
  if (m?.[1] && /境界|realm|修为|层级/.test(conflict)) {
    const wrong = conflict.match(/为「([^」]+)」|写为「([^」]+)」|叙述为「([^」]+)」/)
    const wrongRaw = wrong?.[1] || wrong?.[2] || wrong?.[3]
    if (wrongRaw && wrongRaw !== m[1]) {
      return {
        expectedRaw: m[1],
        wrongRaw,
        scope: /章末/.test(conflict) ? 'ending' : 'full',
      }
    }
  }
  return null
}

export function fixRealmRegressionInContent(content: string, fix: {
  expectedRaw: string
  wrongRaw: string
  scope: 'ending' | 'full'
}): string {
  const expected = parseRealmToken(fix.expectedRaw) ?? firstRealmMention(fix.expectedRaw)
  const tailLen = 2200
  const start = fix.scope === 'ending' ? Math.max(0, content.length - tailLen) : 0
  const head = content.slice(0, start)
  let span = content.slice(start)

  if (fix.wrongRaw && span.includes(fix.wrongRaw)) {
    span = span.split(fix.wrongRaw).join(fix.expectedRaw)
  }
  if (expected) {
    span = liftLowerRealmsInSpan(span, expected)
  }

  return head + span
}
