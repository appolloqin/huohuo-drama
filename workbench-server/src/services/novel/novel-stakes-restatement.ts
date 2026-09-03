/**
 * 章内条款复读：同一「金额 + 时限 + 证物/罪名」簇反复出现时剥后段；
 * 并对白后纯数字回声一并剥掉。
 * 题材无关启发式：数字包 + 常见胁迫名词；带搜屋/逐出等新手段的升级句保留。
 */
import { logTaskWarn } from '../../common/task/task-logger.js'

function cnRunToArabic(token: string): string {
  if (/^\d+$/.test(token)) return token
  const digit: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  if (token === '十') return '10'
  if (token.includes('百')) {
    const [hi, rest = ''] = token.split('百')
    const h = hi ? (digit[hi] ?? 0) : 1
    if (!rest) return String(h * 100)
    if (rest === '十') return String(h * 100 + 10)
    if (rest.startsWith('十')) {
      const low = digit[rest[1]!] ?? 0
      return String(h * 100 + 10 + low)
    }
    let n = h * 100
    if (rest.length === 1 && digit[rest] != null) n += digit[rest]!
    return String(n)
  }
  if (token.startsWith('十')) return String(10 + (digit[token[1]!] ?? 0))
  if (token.endsWith('十') && token.length === 2) {
    return String((digit[token[0]!] ?? 0) * 10)
  }
  if (token.length === 3 && token[1] === '十') {
    return String((digit[token[0]!] ?? 0) * 10 + (digit[token[2]!] ?? 0))
  }
  if (token.length === 1 && digit[token] != null) return String(digit[token])
  let out = ''
  for (const ch of token) out += digit[ch] != null ? String(digit[ch]) : ch
  return out
}

const NEW_MEANS_RE =
  /逐户搜|搜屋|搜出|备案|逐出|封门|限时|亮(?:刀|器|牌)|点名|拍在.{0,16}(?:桌|案)|石供桌|架(?:刀|剑)/

const STAKE_NOUN_RE = /游煞|骸骨|通魔|镇魔司|借据|抄家|灭族|除名/

/** 长句内可剥的「同条款换皮」子句 */
const INNER_PACKAGE_CLAUSE_RE =
  /(?:我[^，。]{0,12}好心[^，。]{0,16})?(?:(?:\d+|[一两三四五六七八九十])日之内[，,]?)(?:拿)?(?:\d+|[零〇一两二三四五六七八九十百千]{1,4})两(?:白银|银子|碎银)?[^。！？]{0,36}(?:一具)?(?:游煞)?[^。！？]{0,6}(?:完整)?骸骨[^。！？]{0,48}(?:少一样[^。！？]{0,36})?/g

/** 跨角色/接招复读：起算+天数+交割+后果链 */
const DEADLINE_PACKAGE_CLAUSE_RE =
  /(?:明日)?卯时(?:起(?:算)?)?[，,]?\s*拢共?\s*(?:\d+|[一二三四五六七八九十])+\s*日[。，,；]?[^”"」]*?(?:第\s*[四4]\s*日[^”"」]*?辰时[^”"」]*?)?(?:来收|收)[^”"」]*?(?:骸骨|游煞)[^”"」]*?(?:[；;][^”"」]*?(?:连坐|三十七|满门)[^”"」]*)?/g

/** 「把『连坐』又说一遍」类强调复读 */
const EMPHASIS_TERM_REPEAT_RE =
  /[^。！？\n]{0,24}(?:把)?「[^」]{1,10}」(?:两个)?字(?:又)?说(?:了)?(?:一遍|一遍)[^。！？\n]{0,16}[。！？]?/g

const CROSS_SPEAKER_WINDOW = 2500

type SentSpan = { start: number; end: number; text: string }

type PackageHit = SentSpan & {
  amounts: string[]
  deadlines: string[]
  nouns: string[]
  signature: string
  pureEcho: boolean
}

function sentenceSpans(raw: string): SentSpan[] {
  const out: SentSpan[] = []
  const re = /[^\n。！？]+[。！？]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const text = m[0]
    if ([...text.replace(/\s/g, '')].length < 2) continue
    out.push({ start: m.index, end: m.index + text.length, text })
  }
  return out
}

/** 引号对白块（内含句号也不拆，供跨角色条款指纹比对） */
function quotedSpans(raw: string): SentSpan[] {
  const out: SentSpan[] = []
  const patterns = [
    /[“"][^”"]+[”"]/g,
    /"[^"\n]+"/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

function owningSentence(raw: string, inner: SentSpan): SentSpan {
  for (const sp of sentenceSpans(raw)) {
    if (inner.start >= sp.start && inner.end <= sp.end) return sp
  }
  return inner
}

/** 接招复读常带「他又补一句，」等引导，删 echo 时一并去掉 */
function expandEchoLeadIn(raw: string, target: SentSpan): SentSpan {
  const leadRe = /(?:他又(?:补)?一句|又(?:说|道)|重复(?:一遍|道))[，,]?\s*$/
  const before = raw.slice(Math.max(0, target.start - 28), target.start)
  const m = before.match(leadRe)
  if (m && m.index != null) {
    const newStart = target.start - (before.length - m.index)
    return { start: newStart, end: target.end, text: raw.slice(newStart, target.end) }
  }
  return target
}

function extractAmounts(text: string): string[] {
  const out: string[] = []
  const re = /(\d+|[零〇一两二三四五六七八九十百千]{1,4})两(?:白银|银子|碎银|纹银)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(`${cnRunToArabic(m[1]!)}两`)
  }
  return [...new Set(out)]
}

function extractDeadlines(text: string): string[] {
  const out: string[] = []
  const re = /(\d+|[一两三四五六七八九十])日(?:之内|内)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(`${cnRunToArabic(m[1]!)}日`)
  }
  return [...new Set(out)]
}

function extractNouns(text: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(STAKE_NOUN_RE.source, 'g')
  while ((m = re.exec(text)) !== null) out.push(m[0]!)
  return [...new Set(out)]
}

function buildSignature(amounts: string[], deadlines: string[], nouns: string[]): string | null {
  const a = amounts.slice().sort()
  const d = deadlines.slice().sort()
  const n = nouns.slice().sort()
  if (a.length && d.length && n.length) {
    return `A:${a.join(',')}|D:${d.join(',')}|N:${n.join(',')}`
  }
  if (a.length && d.length) return `A:${a.join(',')}|D:${d.join(',')}`
  if (a.length && n.length) return `A:${a.join(',')}|N:${n.join(',')}`
  return null
}

/** 同金额即同簇（已具备 signature 的命中） */
function softKey(hit: PackageHit): string {
  return hit.amounts[0] || `_${hit.deadlines[0] || ''}`
}

/**
 * 对白后 / 独立成句的纯数字回声。
 * 带人名、施压从句、多条款并列的立约句不算回声。
 */
function isPureNumberEcho(text: string, amounts: string[], deadlines: string[]): boolean {
  const compact = text.replace(/\s+/g, '').replace(/^[“”"‘’]+|[“”"‘’]+$/g, '')
  if ([...compact].length > 18) return false
  if (!amounts.length && !deadlines.length) return false
  if (/秦霄|钱虎|钱爷|报上|留条|好心|按了|拿不出|少一样|通魔|镇魔司|借据|尸傀|清河/.test(text)) {
    return false
  }
  if (/[，、；：]/.test(compact) && (amounts.length + deadlines.length) >= 2) return false
  if (/一具/.test(compact) && /骸骨/.test(compact) && deadlines.length) return false

  const stripped = compact
    .replace(/(\d+|[零〇一两二三四五六七八九十百千]{1,4})两(?:白银|银子|碎银|纹银)?/g, '')
    .replace(/(\d+|[一两三四五六七八九十])日(?:之内|内)?/g, '')
    .replace(/一具|游煞|完整|的|骸骨|加|与|和|外加|白银|银子/g, '')
    .replace(/[，。！？、；：…—\-~·]/g, '')
  if ([...stripped].length <= 1) return true
  if (/^[\d一两三四五六七八九十百千]+两(?:白银|银子)?。?$/.test(compact)) return true
  if (/^[\d一两三四五六七八九十]+日(?:之内|内)?。?$/.test(compact)) return true
  if (/^[\d一两三四五六七八九十百千]+两(?:白银|银子)?加一具.+骸骨。?$/.test(compact)) return true
  return false
}

export function collectStakesPackageHits(content: string): PackageHit[] {
  const raw = content || ''
  const hits: PackageHit[] = []
  for (const sp of sentenceSpans(raw)) {
    const amounts = extractAmounts(sp.text)
    const deadlines = extractDeadlines(sp.text)
    const nouns = extractNouns(sp.text)
    const signature = buildSignature(amounts, deadlines, nouns)
    const pureEcho = isPureNumberEcho(sp.text, amounts, deadlines)
    if (!signature && !pureEcho) continue
    hits.push({
      ...sp,
      amounts,
      deadlines,
      nouns,
      signature: signature || `ECHO:${amounts.join(',')}|${deadlines.join(',')}`,
      pureEcho,
    })
  }
  return hits
}

export function countStakesPackageHits(content: string): number {
  return collectStakesPackageHits(content).filter(h => !h.pureEcho).length
}

function hasNewMeans(text: string): boolean {
  return NEW_MEANS_RE.test(text)
}

/** 起算+天数+交割+后果 指纹（跨角色 echo 用，不要求金额） */
export function deadlinePackageFingerprint(text: string): string | null {
  const t = text.replace(/\s+/g, '')
  let score = 0
  const tags: string[] = []
  if (/卯时|起算/.test(t)) {
    tags.push('mao')
    score++
  }
  if (/拢共?\d+日|\d+日(?:之内|内)?/.test(t)) {
    tags.push('days')
    score++
  }
  if (/第[四44]日|辰时/.test(t)) {
    tags.push('d4')
    score++
  }
  if (/骸骨|游煞/.test(t)) {
    tags.push('bone')
    score++
  }
  if (/连坐|三十七|满门|除名/.test(t)) {
    tags.push('mass')
    score++
  }
  return score >= 3 ? tags.sort().join('|') : null
}

function stripDeadlinePackageClause(sentence: string): string | null {
  const next = sentence.replace(DEADLINE_PACKAGE_CLAUSE_RE, '').replace(EMPHASIS_TERM_REPEAT_RE, '')
  if (next === sentence) return null
  const cleaned = next
    .replace(/[，,；;]{2,}/g, '，')
    .replace(/([“"])\s*[，,；;]/g, '$1')
    .replace(/[，,；;]\s*([”"])/g, '$1')
    .replace(/^[，,；;]+|[，,；;]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if ([...cleaned.replace(/\s/g, '')].length < 6) return null
  return cleaned
}

/** 跨说话人/接招方整段复读 deadline 包：同指纹 2 次即剥后段 */
function collectCrossSpeakerDeadlineEdits(
  raw: string,
  spans: SentSpan[],
): Array<{ kind: 'delete' | 'replace'; start: number; end: number; next?: string; excerpt: string }> {
  const edits: Array<{
    kind: 'delete' | 'replace'
    start: number
    end: number
    next?: string
    excerpt: string
  }> = []
  const seen = new Map<string, { start: number; end: number }>()
  const markedSentences = new Set<string>()

  for (const quote of quotedSpans(raw)) {
    const fp = deadlinePackageFingerprint(quote.text)
    if (!fp) continue

    const target = expandEchoLeadIn(raw, owningSentence(raw, quote))
    const rangeKey = `${target.start}-${target.end}`
    const prev = seen.get(fp)
    if (prev && target.start - prev.end <= CROSS_SPEAKER_WINDOW) {
      if (markedSentences.has(rangeKey)) continue
      if (hasNewMeans(target.text)) continue
      markedSentences.add(rangeKey)
      const charLen = [...target.text].length
      if (charLen > 55) {
        const trimmed = stripDeadlinePackageClause(target.text)
        if (trimmed) {
          edits.push({
            kind: 'replace',
            start: target.start,
            end: target.end,
            next: trimmed,
            excerpt: target.text.slice(0, 48),
          })
          continue
        }
      }
      edits.push({
        kind: 'delete',
        start: target.start,
        end: target.end,
        excerpt: target.text.slice(0, 48),
      })
      continue
    }
    seen.set(fp, { start: target.start, end: target.end })
  }

  // 无引号包裹的 deadline 包（整句叙述）
  for (const sp of spans) {
    if (/^[“"]/.test(sp.text.trim())) continue
    const fp = deadlinePackageFingerprint(sp.text)
    if (!fp) continue
    const rangeKey = `${sp.start}-${sp.end}`
    const prev = seen.get(fp)
    if (prev && sp.start - prev.end <= CROSS_SPEAKER_WINDOW) {
      if (markedSentences.has(rangeKey)) continue
      if (hasNewMeans(sp.text)) continue
      markedSentences.add(rangeKey)
      edits.push({ kind: 'delete', start: sp.start, end: sp.end, excerpt: sp.text.slice(0, 48) })
      continue
    }
    if (!seen.has(fp)) seen.set(fp, { start: sp.start, end: sp.end })
  }

  // 强调词复读（与 fingerprint 无关）
  for (const sp of spans) {
    if (!EMPHASIS_TERM_REPEAT_RE.test(sp.text)) continue
    EMPHASIS_TERM_REPEAT_RE.lastIndex = 0
    if (hasNewMeans(sp.text)) continue
    const trimmed = sp.text.replace(EMPHASIS_TERM_REPEAT_RE, '').trim()
    EMPHASIS_TERM_REPEAT_RE.lastIndex = 0
    if (!trimmed || [...trimmed.replace(/\s/g, '')].length < 6) {
      edits.push({ kind: 'delete', start: sp.start, end: sp.end, excerpt: sp.text.slice(0, 48) })
    } else if (trimmed !== sp.text) {
      edits.push({
        kind: 'replace',
        start: sp.start,
        end: sp.end,
        next: trimmed,
        excerpt: sp.text.slice(0, 48),
      })
    }
  }

  return edits
}

function stripInnerPackageClause(sentence: string): string | null {
  const next = sentence.replace(INNER_PACKAGE_CLAUSE_RE, '')
  if (next === sentence) return null
  const cleaned = next
    .replace(/[，,]{2,}/g, '，')
    .replace(/([“"])\s*[，,]/g, '$1')
    .replace(/[，,]\s*([”"])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if ([...cleaned.replace(/\s/g, '')].length < 8) return null
  return cleaned
}

/**
 * 剥条款复读与数字回声。
 * - 纯数字回声：删整句
 * - 同金额包 ≥3：保留首次；后续无新手段则删整句，或长句内只剥条款子句
 */
export function stripStakesPackageRestatement(content: string): {
  text: string
  removed: boolean
  stripped: number
} {
  const raw = content || ''
  if (!raw.trim()) return { text: raw, removed: false, stripped: 0 }

  const hits = collectStakesPackageHits(raw)
  const sentenceList = sentenceSpans(raw)

  type Edit =
    | { kind: 'delete'; start: number; end: number; hit?: PackageHit; excerpt?: string }
    | { kind: 'replace'; start: number; end: number; next: string; hit?: PackageHit; excerpt?: string }

  const edits: Edit[] = []

  for (const ce of collectCrossSpeakerDeadlineEdits(raw, sentenceList)) {
    edits.push(
      ce.kind === 'delete'
        ? { kind: 'delete', start: ce.start, end: ce.end, excerpt: ce.excerpt }
        : { kind: 'replace', start: ce.start, end: ce.end, next: ce.next!, excerpt: ce.excerpt },
    )
  }

  if (!hits.length && !edits.length) return { text: raw, removed: false, stripped: 0 }

  const byKey = new Map<string, PackageHit[]>()
  for (const h of hits) {
    if (h.pureEcho) continue
    const key = softKey(h)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(h)
  }

  for (const h of hits) {
    if (h.pureEcho) edits.push({ kind: 'delete', start: h.start, end: h.end, hit: h })
  }

  for (const [, group] of byKey) {
    if (group.length < 3) continue
    for (let i = 1; i < group.length; i++) {
      const h = group[i]!
      if (hasNewMeans(h.text)) continue
      const charLen = [...h.text].length
      if (charLen > 70) {
        const trimmed = stripInnerPackageClause(h.text)
        if (trimmed) {
          edits.push({ kind: 'replace', start: h.start, end: h.end, next: trimmed, hit: h })
          continue
        }
      }
      edits.push({ kind: 'delete', start: h.start, end: h.end, hit: h })
    }
  }

  // 同区间去重，后写覆盖
  const byRange = new Map<string, Edit>()
  for (const e of edits) {
    byRange.set(`${e.start}-${e.end}`, e)
  }
  const ordered = [...byRange.values()].sort((a, b) => b.start - a.start)
  if (!ordered.length) return { text: raw, removed: false, stripped: 0 }

  let text = raw
  let stripped = 0
  for (const e of ordered) {
    const next =
      e.kind === 'delete'
        ? `${text.slice(0, e.start)}${text.slice(e.end)}`
        : `${text.slice(0, e.start)}${e.next}${text.slice(e.end)}`
    if ([...next].length < [...raw].length * 0.45) continue
    text = next
    stripped += 1
    logTaskWarn('Novel', 'stakes-package-restatement-stripped', {
      excerpt: (e.hit?.text ?? e.excerpt ?? '').slice(0, 48).replace(/\s+/g, ' '),
      pureEcho: e.hit?.pureEcho,
      kind: e.kind,
      signature: e.hit?.signature,
    })
  }

  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
  text = text.replace(/([！？。])”“/g, '$1” “')

  return { text, removed: stripped > 0, stripped }
}
