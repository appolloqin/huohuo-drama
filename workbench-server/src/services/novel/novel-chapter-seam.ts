/**
 * 章缝去重（题材无关）：禁止下章开篇重演上章末已完成高潮，
 * 以及「大纲过期拍点 / 拍点顺序倒退 / 弱承接」导致的后退写。
 *
 * 不依赖具体场景词（破门、提亲、村民等）；只凭大纲拍点顺序、文本重合与承接强度。
 */
import type { AuditConflict } from './novel-continuity-precheck.js'
import { filterSubstantiveOutlineBeats, outlineBeatCoveredIn } from './novel-outline-beat-cover.js'
import type { ChapterEndSnapshot } from '../../common/novel/novel-continuity-state.js'
import {
  detectChapterSeamPresenceReentry,
  detectChapterSeamQuietCloseJump,
  detectChapterBodyEventReplay,
  detectOpeningAgainstChapterEndSnapshot,
  prevEndsWithDeparture,
  prevImpliesStableCopresence,
  prevTailWithSnapshotTime,
} from './novel-chapter-end-snapshot.js'

/** 兼容 「」『』“” 及 ASCII 引号（用 \u 避免源码引号歧义） */
const SPEECH_RE = new RegExp(
  `[\u300c\u300e\u201c\u0022]([^\u300d\u300f\u201d\u0022]{8,120})[\u300d\u300f\u201d\u0022]`,
  'g',
)

function normalizeText(s: string): string {
  return s.replace(/\s+/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”]/g, '')
}

function extractSpeeches(text: string, max = 6): string[] {
  const out: string[] = []
  SPEECH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SPEECH_RE.exec(text)) !== null) {
    const t = m[1]?.trim()
    if (t && [...t].length >= 8) out.push(t)
  }
  return out.slice(-max)
}

/** 取末尾若干完整句作高潮锚点（题材无关） */
function extractTailSentences(text: string, max = 5): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const parts = cleaned
    .split(/(?<=[。！？…])\s*/)
    .map(s => s.trim())
    .filter(s => [...s].length >= 10)
  return parts.slice(-max)
}

function speechOverlap(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (na.length < 8 || nb.length < 8) return 0
  if (na.includes(nb) || nb.includes(na)) return 1
  let bestChars = 0
  const maxW = Math.min(24, na.length, nb.length)
  for (let w = maxW; w >= 8; w--) {
    for (let i = 0; i <= na.length - w; i++) {
      if (nb.includes(na.slice(i, i + w))) {
        bestChars = w
        return Math.min(1, bestChars / 12)
      }
    }
  }
  return 0
}

function sentenceReplayScore(prevTail: string, opening: string): { score: number; snippet: string } {
  const openNorm = normalizeText(opening.slice(0, 1600))
  let bestChars = 0
  let snippet = ''
  for (const s of extractTailSentences(prevTail, 5)) {
    const ns = normalizeText(s)
    if (ns.length < 8) continue
    const maxW = Math.min(28, ns.length)
    for (let w = maxW; w >= 8; w--) {
      for (let i = 0; i <= ns.length - w; i++) {
        const chunk = ns.slice(i, i + w)
        if (openNorm.includes(chunk)) {
          if (w > bestChars) {
            bestChars = w
            snippet = chunk.slice(0, 40)
          }
          break
        }
      }
      if (bestChars >= w) break
    }
  }
  return { score: Math.min(1, bestChars / 12), snippet }
}

function bigramJaccard(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (na.length < 40 || nb.length < 40) return 0
  const grams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const A = grams(na)
  const B = grams(nb)
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  const union = A.size + B.size - inter
  return union > 0 ? inter / union : 0
}

function longestCommonSubstringRatio(a: string, b: string): { ratio: number; snippet: string } {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  const minNeed = 12
  if (na.length < minNeed || nb.length < minNeed) return { ratio: 0, snippet: '' }
  const A = na.length > 800 ? na.slice(-800) : na
  const B = nb.length > 1000 ? nb.slice(0, 1000) : nb
  for (let len = Math.min(40, A.length, B.length); len >= minNeed; len -= 2) {
    for (let i = 0; i <= A.length - len; i += 2) {
      const chunk = A.slice(i, i + len)
      if (B.includes(chunk)) {
        return { ratio: len / Math.min(A.length, B.length), snippet: chunk.slice(0, 40) }
      }
    }
  }
  return { ratio: 0, snippet: '' }
}

/** 短语是否在正文中出现（整段或连续 ≥5 字；4 字整段仅当要点本身 ≤4 字） */
export function phraseAppearsIn(haystack: string, phrase: string): boolean {
  const h = normalizeText(haystack)
  const p = normalizeText(phrase)
  if (p.length < 4 || h.length < 4) return false
  if (h.includes(p)) return true
  const minW = p.length <= 4 ? 4 : 5
  const maxW = Math.min(16, p.length)
  for (let w = maxW; w >= minW; w--) {
    for (let i = 0; i <= p.length - w; i++) {
      if (h.includes(p.slice(i, i + w))) return true
    }
  }
  return false
}

/**
 * 从大纲切出有序「情节拍点」（顺序即大纲叙述顺序，用于倒退判定）。
 */
export function extractOutlineBeatPhrases(outline: string, max = 12): string[] {
  const cleaned = outline.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  // 只按强分隔符切拍点；勿用 ，、 切开——中文大纲常在同一拍内用顿号/逗号列要点，
  // 切开后末拍会变成「硬着头皮面对这一局」这类碎片，导致越界漏检。
  const parts = cleaned
    .split(/[/／|｜；;\n]+|(?<=[。！？])\s*/)
    .map(s => s.trim())
    .filter(s => {
      const n = [...s].length
      return n >= 4 && n <= 80
    })
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = normalizeText(p)
    if (key.length < 4 || seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/**
 * 本章大纲要点是否已在上章正文出现（大纲过期 → 易诱发后退写）。
 */
export function findStaleOutlineBeats(outline: string, prevText: string): string[] {
  if (!outline.trim() || !prevText.trim()) return []
  return extractOutlineBeatPhrases(outline).filter(beat => phraseAppearsIn(prevText, beat))
}

export function buildOutlineStaleBlock(args: {
  chapterOutline?: string
  prevTail: string
  chapterNumber: number
}): string {
  const { chapterOutline, prevTail, chapterNumber } = args
  if (chapterNumber < 2 || !chapterOutline?.trim() || !prevTail.trim()) return ''
  const stale = findStaleOutlineBeats(chapterOutline, prevTail)
  if (!stale.length) return ''
  return [
    '【本章大纲过期冲突 — 硬性】',
    '下列大纲要点已在【上章结尾/前序正文】出现，**禁止再写**；请从上章已发生事实**之后**推进新阻力/新信息：',
    ...stale.slice(0, 8).map((s, i) => `${i + 1}. ${s}`),
    '大纲中排在上述要点**之前**的拍点若尚未在本章应有位置出现，也禁止倒退重演；以前序正文进度为准。',
  ].join('\n')
}

/**
 * 开篇与上章末是否「弱承接」：几乎接不上对白/场面（题材无关）。
 * 弱承接 + 大纲已有完成拍点 → 高度疑似从更早节点重开。
 */
export function isWeakSeamContinuation(prevTail: string, opening: string): boolean {
  const prev = prevTail.trim().slice(-1200)
  const open = opening.trim().slice(0, 1000)
  if ([...prev].length < 80 || [...open].length < 40) return false

  const prevSpeeches = extractSpeeches(prev, 6)
  const openSpeeches = extractSpeeches(open, 8)
  let bestSpeech = 0
  for (const p of prevSpeeches) {
    for (const c of openSpeeches) {
      bestSpeech = Math.max(bestSpeech, speechOverlap(p, c))
    }
    const np = normalizeText(p)
    if (np.length >= 10 && normalizeText(open).includes(np.slice(0, Math.min(12, np.length)))) {
      bestSpeech = Math.max(bestSpeech, 0.4)
    }
  }
  const sent = sentenceReplayScore(prev, open)
  const jaccard = bigramJaccard(prev.slice(-700), open.slice(0, 1000))
  const lcs = longestCommonSubstringRatio(prev, open)

  const strongLink =
    bestSpeech >= 0.28
    || sent.score >= 0.28
    || jaccard >= 0.14
    || lcs.ratio >= 0.06
  return !strongLink
}

/**
 * 大纲拍点顺序倒退（题材无关）：
 * 上章已完成较后拍点，开篇却在落实更早拍点；或开篇直接落实已完成拍点。
 */
export function detectOutlineBeatOrderRewind(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  chapterOutline?: string
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, chapterOutline } = args
  if (chapterNumber < 2 || !prevChapterTail?.trim() || !chapterOutline?.trim()) return null

  const beats = extractOutlineBeatPhrases(chapterOutline)
  if (beats.length < 2) return null

  const prev = prevChapterTail.trim()
  const opening = content.trim().slice(0, Math.min(content.trim().length, 1200))
  if ([...opening].length < 80) return null

  const done = beats.map(b => phraseAppearsIn(prev, b))
  const inOpen = beats.map(b => phraseAppearsIn(opening, b))

  for (let i = 0; i < beats.length; i++) {
    if (!inOpen[i]) continue
    if (done[i]) {
      return {
        layer: 'hard',
        rule: 'chapter_seam_replay',
        message:
          `章缝回放（大纲过期）：开篇落实了已在上章出现的大纲拍点「${beats[i]}」。请删除该回放，从上章已发生事实之后起笔。`,
      }
    }
    for (let j = i + 1; j < beats.length; j++) {
      if (done[j]) {
        return {
          layer: 'hard',
          rule: 'chapter_seam_replay',
          message:
            `章缝后退写（拍点倒序）：上章已完成较后大纲拍点「${beats[j]}」，开篇却在写更早拍点「${beats[i]}」。请按前序进度承接，勿倒退重演。`,
        }
      }
    }
  }
  return null
}

/**
 * 过期大纲 + 开篇弱承接：开篇几乎接不上章末，却仍有大纲拍点已在上章完成
 * （覆盖「开篇换措辞重开更早节点、与大纲字面不完全相同」的情况）。
 */
export function detectStaleOutlineWeakContinuation(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  chapterOutline?: string
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, chapterOutline } = args
  if (chapterNumber < 2 || !prevChapterTail?.trim() || !chapterOutline?.trim()) return null

  const stale = findStaleOutlineBeats(chapterOutline, prevChapterTail)
  if (!stale.length) return null

  const opening = content.trim().slice(0, Math.min(content.trim().length, 1200))
  if ([...opening].length < 80) return null
  if (!isWeakSeamContinuation(prevChapterTail, opening)) return null

  return {
    layer: 'hard',
    rule: 'chapter_seam_replay',
    message:
      `章缝后退写（弱承接+大纲过期）：上章已完成大纲拍点「${stale[0]}」，但本章开篇与上章末衔接很弱，疑似倒退到更早节点重开。请紧接上章已发生事实之后起笔，跳过过期拍点。`,
  }
}

/** 日内时辰粗粒度（越大越晚）；只用于章缝倒退，不绑具体题材词表扩写 */
type DayPhase = { phase: number; label: string }

const DAY_PHASE_CUES: { phase: number; label: string; re: RegExp }[] = [
  { phase: 0, label: '黎明/晨光', re: /晨光|拂晓|黎明|破晓|天没亮|天尚未亮|蒙蒙亮|东方刚[白亮]/ },
  { phase: 1, label: '清晨', re: /清晨|清早|大清早|一大早|早上(?!午)/ },
  { phase: 2, label: '正午', re: /日头[^。！？\n]{0,16}(正中|中央|当顶)|正午|中午|日上三竿/ },
  { phase: 3, label: '午后', re: /午后|下午|日头西[斜沉]/ },
  { phase: 4, label: '傍晚', re: /黄昏|傍晚|暮色|夕阳|擦黑|日头坠/ },
  { phase: 5, label: '夜里', re: /夜里|夜色|月色|掌灯|深夜|黑灯瞎火|夜深|半夜|入夜|夜间/ },
]

/** 同日倒退时的跨日明示（仅用于正午/午后/傍晚 → 晨；夜→晨本身即跨日正向） */
const SAME_DAY_REWIND_EXEMPT_RE = /次日|翌日|第二天|隔日|一夜过|过了一夜|一觉醒|睡到天亮|天又亮|第二日|隔夜/

function findDayPhases(text: string): DayPhase[] {
  const hits: DayPhase[] = []
  for (const cue of DAY_PHASE_CUES) {
    if (cue.re.test(text)) hits.push({ phase: cue.phase, label: cue.label })
  }
  return hits
}

/**
 * 章缝时辰倒退（相位结构，不靠睡醒/物件词表）：
 * - 夜→晨/黎明：日循环正向，一律放行
 * - 正午/午后/傍晚 → 晨：同日倒退，须开篇有跨日明示才放行
 */
export function detectChapterSeamTimeRewind(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail } = args
  if (chapterNumber < 2 || !prevChapterTail?.trim()) return null

  const prev = prevChapterTail.trim().slice(-1000)
  const opening = content.trim().slice(0, Math.min(content.trim().length, 700))
  if ([...opening].length < 40) return null

  const prevPhases = findDayPhases(prev)
  const openPhases = findDayPhases(opening)
  if (!prevPhases.length || !openPhases.length) return null

  // 上章取最晚时辰，开篇取最早时辰
  const prevLate = prevPhases.reduce((a, b) => (b.phase > a.phase ? b : a))
  const openEarly = openPhases.reduce((a, b) => (b.phase < a.phase ? b : a))

  if (openEarly.phase >= prevLate.phase) return null
  // 夜→晨：跨日正向，不要求「次日」词，也不扫睡醒场面词
  if (prevLate.phase >= 5 && openEarly.phase <= 1) return null
  // 同日倒退：上章已到正午及以后，开篇却黎明/清晨，且无跨日明示
  if (prevLate.phase < 2 || openEarly.phase > 1) return null
  if (SAME_DAY_REWIND_EXEMPT_RE.test(opening)) return null

  return {
    layer: 'hard',
    rule: 'chapter_seam_replay',
    message:
      `章缝冷开篇（时辰倒退）：上章末已到「${prevLate.label}」，本章开篇却是「${openEarly.label}」，属同日倒退。`
      + '请紧接上章时辰之后起笔，或开篇写明跨到次日；禁止无跨日承接的晨光重开。',
  }
}

/**
 * 章缝冷开篇（题材无关）：开篇未进入本章大纲前段拍点。
 * - 时辰倒退（日头正中→晨光等）
 * - 弱承接 + 前段缺失（经典）
 * - 前段命中为 0：即使与上章有林雪等用词重合（假强承接），仍判冷开篇
 *   （覆盖「润色后开篇仍未进大纲前段，但与上章用词重合导致弱承接失效」）
 */
export function detectChapterSeamColdOpen(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  chapterOutline?: string
  /** 上章末状态契约；有则优先做时辰/地点对照 */
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, chapterOutline, prevSnapshot } = args
  if (chapterNumber < 2) return null
  if (!prevChapterTail?.trim() && !prevSnapshot) return null

  const placeHit = detectOpeningAgainstChapterEndSnapshot({
    content,
    chapterNumber,
    prevSnapshot,
  })
  if (placeHit) return placeHit

  const reentryHit = detectChapterSeamPresenceReentry({
    content,
    chapterNumber,
    prevChapterTail,
    prevSnapshot,
  })
  if (reentryHit) return reentryHit

  const quietJump = detectChapterSeamQuietCloseJump({
    content,
    chapterNumber,
    prevChapterTail,
    prevSnapshot,
  })
  if (quietJump) return quietJump

  const prevForTime = prevTailWithSnapshotTime(prevChapterTail, prevSnapshot)
  if (!prevForTime.trim()) return null

  const timeHit = detectChapterSeamTimeRewind({
    content,
    chapterNumber,
    prevChapterTail: prevForTime,
  })
  if (timeHit) {
    if (prevSnapshot) {
      return {
        ...timeHit,
        message: `${timeHit.message}（上章末契约：时间=${prevSnapshot.time}；刚发生=${prevSnapshot.last_event}）`,
      }
    }
    return timeHit
  }

  if (!chapterOutline?.trim() || !prevChapterTail?.trim()) return null

  const beats = filterSubstantiveOutlineBeats(extractOutlineBeatPhrases(chapterOutline))
  if (beats.length < 2) return null

  const opening = content.trim().slice(0, Math.min(content.trim().length, 1400))
  if ([...opening].length < 80) return null

  const early = beats.slice(0, Math.ceil(beats.length / 2))
  const stale = findStaleOutlineBeats(chapterOutline, prevChapterTail)
  const staleSet = new Set(stale.map(s => normalizeText(s)))
  const required = early.filter(b => !staleSet.has(normalizeText(b)))
  if (!required.length) return null

  // 与大纲落实共用锚点/意译覆盖，避免猎捕等意译正文被字面窗误杀
  const hit = required.filter(b => outlineBeatCoveredIn(opening, b))
  const need = Math.max(1, Math.ceil(required.length / 2))
  // 开篇头段（约前 400 字）0 命中、后段才命中 = 离家/重开骨架后再切入大纲 → 仍判冷开篇
  const headLen = Math.min(400, Math.max(160, Math.floor([...opening].length / 3)))
  const head = [...opening].slice(0, headLen).join('')
  const headHit = required.filter(b => outlineBeatCoveredIn(head, b))
  // 共处离场桥 / 夜→晨醒桥：头段可稍后进入大纲拍点，不判杂交冷头
  const bridgeHead = headLooksLikeCopresenceBridge(head, prevChapterTail, prevSnapshot)
    || headLooksLikeOvernightBridge(head, prevChapterTail, prevSnapshot)
  // 头段已有任一前段拍点 → 不算杂交冷头（允许先蹲守再收套）
  const hybridColdHead = headHit.length === 0 && hit.length > 0 && [...head].length >= 120 && !bridgeHead

  if (hit.length >= need && !hybridColdHead) return null

  const weak = isWeakSeamContinuation(prevChapterTail, opening)
  // 前段 0 命中：不依赖弱承接（避免同场景用词假强承接漏检）
  // 杂交冷头：头段无拍点、后段才有 → 不依赖弱承接
  if (!weak && hit.length > 0 && !hybridColdHead) return null

  const missing = required.filter(b => !outlineBeatCoveredIn(opening, b))
  const missingForMsg = missing.length
    ? missing
    : required.filter(b => !outlineBeatCoveredIn(head, b))
  return {
    layer: 'hard',
    rule: 'chapter_seam_replay',
    message:
      hybridColdHead
        ? `章缝冷开篇：开篇头段未进入本章大纲前段（缺失如「${missingForMsg.slice(0, 2).join('；')}」），疑似先写更早节点再切入。请紧接上章已发生事实之后起笔，直接推进本章大纲前段；禁止开篇时空早于上章末。`
        : hit.length === 0
          ? `章缝冷开篇：开篇未命中本章大纲前段任一拍点（缺失如「${missingForMsg.slice(0, 2).join('；')}」）。请紧接上章已发生事实之后起笔，直接推进本章大纲前段；禁止开篇时空早于上章末。`
          : `章缝冷开篇：开篇与上章末弱承接，且未进入本章大纲前段（缺失如「${missingForMsg.slice(0, 2).join('；')}」）。请紧接上章已发生事实之后起笔，直接推进本章大纲前段；禁止开篇时空早于上章末。`,
  }
}

/** @deprecated 使用 detectOutlineBeatOrderRewind / detectStaleOutlineWeakContinuation；保留别名供旧调用 */
export function detectChapterSeamRewind(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  chapterOutline?: string
}): AuditConflict | null {
  return detectOutlineBeatOrderRewind(args) || detectStaleOutlineWeakContinuation(args)
}

/**
 * 开篇是否在落实「已过期大纲」中的要点。
 */
export function detectOpeningFollowsStaleOutline(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  chapterOutline?: string
}): AuditConflict | null {
  return detectOutlineBeatOrderRewind(args)
}

/**
 * 旧稿开篇骨架作废时：强制「上章末承接 → 大纲拍点1」，禁止自由冷开篇。
 */
/** 头段是否为「共处承接 → 离场/隔夜」桥接（允许拍点1稍后再出现） */
export function headLooksLikeCopresenceBridge(
  head: string,
  prevTail?: string,
  prevSnapshot?: ChapterEndSnapshot | null,
): boolean {
  if (!prevImpliesStableCopresence(prevTail, prevSnapshot)) return false
  const h = head.trim()
  if ([...h].length < 28) return false
  // 开篇直接进门/归来 = 桥接失败（勿用「出门」子串，以免误伤「推门出去」）
  if (/推门进来|推门而入|走了进来|进了屋|回到家|赶回来|从外头.{0,8}进来|从外面.{0,8}进来/.test(h)) {
    return false
  }
  // 合法：室内承接，或承接后写离场/隔夜
  const indoorContinue = /坐|对面|屋里|炕|灶|绳|削|沙沙|咳嗽|火光/.test(h)
  const leaveBridge = /推门出去|出了门|披上|进山|上山|次日|第二天|天亮|隔夜|夜里|一早就|出门去|出去了/.test(h)
  return indoorContinue || leaveBridge
}

/**
 * 上章入夜 → 开篇已进入晨/黎明相位（日循环正向）。
 * 允许头段稍后再进日间大纲拍点；只认相位，不认睡醒场面词。
 */
export function headLooksLikeOvernightBridge(
  head: string,
  prevTail?: string,
  prevSnapshot?: ChapterEndSnapshot | null,
): boolean {
  const prevBlob = [
    prevSnapshot?.time ? `时间：${prevSnapshot.time}` : '',
    (prevTail || '').trim().slice(-800),
  ].filter(Boolean).join('\n')
  const prevPhases = findDayPhases(prevBlob)
  if (!prevPhases.some(p => p.phase >= 5)) return false
  const h = head.trim()
  if ([...h].length < 28) return false
  const openPhases = findDayPhases(h)
  return openPhases.some(p => p.phase <= 1)
}

/** 大纲是否暗示「外来者上门/试探」类冲突（结构词，非场面剧本） */
function outlineImpliesExternalVisit(outline?: string): boolean {
  return /上门|来客|来人|来访|敲门|叫门|干事|试探|周旋|探底|敲打|查访|盘问/.test(outline || '')
}

/** 上章末是否已呈「完成态安静收束」（可承接后再起新冲突） */
function prevLooksCompletedQuietClose(
  prevTail?: string,
  snap?: import('../../common/novel/novel-continuity-state.js').ChapterEndSnapshot | null,
): boolean {
  const tip = (prevTail || '').trim().slice(-420)
  const last = (snap?.last_event || '').trim()
  const blob = `${tip}\n${last}`
  if ([...blob].length < 12) return false
  if (!/[了死好妥]/.test(blob.slice(-100))) return false
  // 已离场则走归来桥接，不走「室内收束→来客」
  if (prevEndsWithDeparture(prevTail)) return false
  const enclosed = /屋|炕|灶|房|室内/.test(snap?.place || '')
    || /屋里|炕|灶|门|搁|插/.test(blob)
  return enclosed || prevImpliesStableCopresence(prevTail, snap)
}

export function buildForcedSeamOpeningBlock(args: {
  chapterOutline?: string
  prevTail?: string
  prevSnapshot?: import('../../common/novel/novel-continuity-state.js').ChapterEndSnapshot | null
}): string {
  const beats = extractOutlineBeatPhrases(args.chapterOutline || '').slice(0, 4)
  const beat1 = beats[0]
  const hasTail = !!args.prevTail?.trim()
  const snap = args.prevSnapshot
  const copresent = prevImpliesStableCopresence(args.prevTail, snap)
  const quietToVisit = prevLooksCompletedQuietClose(args.prevTail, snap)
    && outlineImpliesExternalVisit(args.chapterOutline)
  const snapLine = snap
    ? `0. **上章末契约（必须承接）**：时间「${snap.time || '见上章末'}」·地点「${snap.place || '见上章末'}」·刚发生「${snap.last_event || '见上章末'}」·在场「${snap.cast || '见上章末'}」${snap.closed_beats ? `·已闭合「${snap.closed_beats}」` : ''}。开篇不得无故换场重开；已闭合交付同场合勿再演。`
    : ''
  const closedBlock = snap?.closed_beats?.trim()
    ? `0f. **已闭合情节（同场合）**：上章已写完「${snap.closed_beats}」——同一时间/场地勿再掏出/递给/掰开；换日、换场或写明「又一次」后可写新交付；可一句回忆带过。`
    : ''
  const bridgeBlock = copresent && beat1 && !quietToVisit
    ? [
      '0c. **共处→屋外拍点桥接（本次必用）**：上章末已在场共处，而大纲拍点1若在屋外/猎获结果，禁止开篇「推门进来/提着猎物归来」。',
      '顺序必须是：①第一段承接对坐/室内下一拍 → ②离场或隔夜（须写明）→ ③再写拍点1「'
        + beat1
        + '」及之后；拍点1可出现在离场之后，不必硬塞进第一段。',
    ].join('\n')
    : ''
  const visitBlock = quietToVisit
    ? [
      '0e. **收束→外来冲突（开篇窗口内须交代）**：上章末已是完成态安静收束，本章大纲含外来冲突。',
      '手法自选：顺叙（承接→起势→应对）或先果后因/倒叙补叙（可先写余波，再补叙来者与起势）。',
      '硬性：开篇约前 900 字内须点名来者或写出敲/叫/来人起势；禁止「重新/又/再」重做上章收束；禁止窗口内永不交代来者。',
    ].join('\n')
    : ''
  const step1 = !hasTail
    ? '1. 第一段：从本章大纲拍点1起笔，禁止编造大纲未列的离家/准备戏。'
    : quietToVisit
      ? '1. 开篇须承接【上章结尾】完成态之后的新信息（手法自选），勿重做收束。'
      : copresent
        ? '1. 第一段：只承接【上章结尾】已在场状态的下一拍（对坐/室内动作一两句），禁止推门进来、禁止雪光重开直接提猎物进门。'
        : '1. 第一段：只承接【上章结尾】已发生事实之后的下一拍（一两句即可），禁止清晨离家、目送叮嘱、重起炉灶式开篇；禁止直接跳到大纲后段冲突。'
  const step2 = !beat1
    ? '2. 第二段起：立刻进入【本章大纲】第一个情节拍点。'
    : quietToVisit
      ? `2. 开篇窗口内须交代外来冲突如何接上，再落实「${beat1}」；可先果后因，但须补清来者/起势。`
      : copresent
        ? `2. 第二段起：写离场/隔夜后进入大纲拍点1「${beat1}」，不得跳过离场直接写归来收获。`
        : `2. 第二段起：立刻进入本章大纲拍点1「${beat1}」，不得先写拍点1之前的起势，也不得跳过拍点1直接写更后拍点。`
  return [
    '【开篇强制接缝 — 重写/结构作废时生效】',
    snapLine,
    '0b. **在场硬性**：上章末人物已在场共处时，禁止开篇再写进门/归来/抵达或凭空「在外一宿」；若要写归来或隔夜外出，须先承接离场。',
    '0d. **状态硬性**：上章末已完成的收束动作，禁止开篇用「重新/又/再」重做。新冲突须在开篇窗口内交代来者/起势（顺叙或先果后因均可），禁止整段没头没尾半路接戏。',
    closedBlock,
    visitBlock,
    bridgeBlock,
    step1,
    step2,
    beats.length > 1
      ? `3. 随后按序推进：${beats.slice(1).map((b, i) => `${i + 2}. ${b}`).join('；')}`
      : '',
    '4. 禁止自由冷开篇；无大纲命中的旧稿开篇骨架一律作废，不得换皮重写。',
    '5. **时辰硬性**：上章正午/午后/傍晚后禁止无跨日明示的晨光重开；上章入夜后开篇清晨视为次日正向，可再进日间拍点。',
  ].filter(Boolean).join('\n')
}

export function buildChapterSeamWriteBlock(prevTail: string): string {
  const tail = prevTail.trim()
  if (!tail) {
    return [
      '【章缝硬规则】第2章起：从【上章结尾】已发生事实**之后**开笔。',
      '禁止把上章末已经写完的关键对白、公开行动或场面高潮再完整演一遍；一两句承接即可，立刻推进新信息/新阻力。',
      '禁止拍点倒退：上章已完成的情节节点，开篇勿回到更早节点重演。',
      '禁止开篇时空早于上章末已发生事实；禁止倒退到上章已越过的更早情节节点重开。',
    ].join('\n')
  }
  const speeches = extractSpeeches(tail.slice(-1000), 4)
  const sentences = extractTailSentences(tail.slice(-800), 3)
  const speechHint = speeches.length
    ? `上章末已出现的对白（勿再完整复述）：\n${speeches.map((s, i) => `${i + 1}. 「${s.slice(0, 60)}${s.length > 60 ? '…' : ''}」`).join('\n')}`
    : ''
  const sentenceHint = !speeches.length && sentences.length
    ? `上章末关键收束句（勿换皮重写同一拍）：\n${sentences.map((s, i) => `${i + 1}. ${s.slice(0, 70)}${s.length > 70 ? '…' : ''}`).join('\n')}`
    : ''
  return [
    '【章缝硬规则 — 禁止回放上章高潮】',
    '1. 本章起点 = 上章结尾**已经发生**之后；读者已知内容不要重演。',
    '2. 禁止「同一高潮换措辞」：上章末已完成的关键对白、公开行动、冲突落点，开篇勿再铺一遍。',
    '3. 禁止拍点倒退：勿回到上章已越过的更早情节节点重开。',
    '4. 禁止开篇时空早于上章末已发生事实；禁止倒退到上章已越过的更早情节节点重开。',
    '5. **时辰**：开篇不得早于上章末已写明的日光/时辰（如日头正中后禁止晨光重开；到次日须写明次日）。',
    '6. 允许：一两句承接或他人反应，然后立刻进入本章新阻力/新信息。',
    speechHint || sentenceHint,
    `【上章结尾（须承接，勿重演）】\n${tail.slice(-1200)}`,
  ].filter(Boolean).join('\n')
}

export function buildRewriteAntiSeamBlock(args: {
  existingText: string
  prevTail: string
  chapterNumber: number
  chapterOutline?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): string {
  const { existingText, prevTail, chapterNumber, chapterOutline, prevSnapshot } = args
  if (chapterNumber < 2) return ''
  const draft = existingText.trim()
  const hit = (prevTail.trim() || prevSnapshot) && draft
    ? detectChapterSeamReplay({
      content: draft,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
      prevSnapshot,
    })
    : null
  const stale = chapterOutline?.trim() && prevTail.trim()
    ? findStaleOutlineBeats(chapterOutline, prevTail)
    : []
  const lines = [
    '【重写·章缝去重（硬性）】',
    '1. 「保留情节」= 保留本章应推进的新信息、人物关系与后半可用桥段；**不等于**保留开篇对上章高潮的重演。',
    '2. 若草稿开篇重做收束或整段没头没尾半路接戏，必须改掉；可用顺叙或先果后因重写同一情节，只要不吃书。',
    '3. 禁止「同一高潮换措辞」再演一遍；禁止按过期大纲拍点后退写。',
  ]
  if (stale.length) {
    lines.push(`4. 本章大纲中已在上章完成的要点：${stale.slice(0, 5).join('；')}——重写时禁止再写。`)
  }
  if (hit) {
    const n = stale.length ? 5 : 4
    lines.push(`${n}. 系统已判定**当前草稿开篇存在章缝硬伤**：${hit.message}`)
    lines.push(`${n + 1}. 输出完整替换稿时须消除该硬伤；允许倒叙/先果后因，禁止换皮保留「重新收束 / 永不交代来者」骨架。`)
    const badHead = draft.replace(/\s+/g, '').slice(0, 48)
    if (badHead) {
      lines.push(`${n + 2}. 旧开篇毒句勿沿用（仅示警）：「${badHead}${draft.length > 48 ? '…' : ''}」`)
    }
  }
  return lines.join('\n')
}

/**
 * @deprecated 重写请用 `formatWeakRewriteDraftBlock`（novel-outline-compliance）。
 * 保留薄封装：仅输出弱提示，不再 dump 近全文。
 */
export function formatRewriteDraftBlock(args: {
  existingText: string
  prevTail: string
  chapterNumber: number
  chapterOutline?: string
  maxChars?: number
}): string {
  const full = args.existingText.trim()
  if (!full) return ''
  const beats = extractOutlineBeatPhrases(args.chapterOutline || '')
  const hit = args.chapterNumber >= 2 && args.prevTail.trim()
    ? detectChapterSeamReplay({
      content: full,
      chapterNumber: args.chapterNumber,
      prevChapterTail: args.prevTail,
      chapterOutline: args.chapterOutline,
    })
    : null
  const lines = [
    '【重写草稿 — 弱锚定】勿把旧稿当结构模板；只展开大纲已覆盖拍点。',
    beats.length
      ? `须落实拍点：${beats.slice(0, 8).join('；')}`
      : '',
    hit ? `章缝风险：${hit.message}` : '',
    `旧稿摘录（仅供人物关系参考）：\n${full.slice(0, 400)}${full.length > 400 ? '…' : ''}`,
  ]
  return lines.filter(Boolean).join('\n')
}

/** 契约 cast 字段拆人名（顿号/逗号），题材无关 */
function castNamesFromSnapshot(cast?: string): string[] {
  if (!cast?.trim() || cast === '未明示') return []
  return cast
    .split(/[、，,/／|｜\s]+/)
    .map(s => s.replace(/\s+/g, '').trim())
    .filter(s => [...s].length >= 2 && [...s].length <= 4)
}

/**
 * 上章末「刚发生」被开篇换皮重演（题材无关）。
 * 信号：契约 last_event 被开篇覆盖 / 与上章末高重合 + cast 人名再现。
 * 不扫场面动作专词表。
 */
export function detectChapterSeamClimaxReplay(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, prevSnapshot } = args
  if (chapterNumber < 2) return null

  const prevClimax = (prevChapterTail || '').trim().slice(-900)
  const opening = content.trim().slice(0, Math.min(content.trim().length, 900))
  if ([...opening].length < 60) return null

  const lastEvent = prevSnapshot?.last_event?.trim()
  const eventFp = lastEvent && lastEvent !== '未明示'
    ? lastEvent
    : ''
  if (!eventFp && [...prevClimax].length < 80) return null

  const eventCovered = eventFp
    ? outlineBeatCoveredIn(opening, eventFp)
    : false
  const overlap = bigramJaccard(
    prevClimax || eventFp,
    opening.slice(0, 700),
  )

  const castNames = castNamesFromSnapshot(prevSnapshot?.cast)
  const sharedCast = castNames.filter(
    n => opening.includes(n) && (prevClimax.includes(n) || (eventFp ? eventFp.includes(n) : false)),
  )

  // 须「事件指纹命中」或「与上章末高重合」，再叠加人名/重合门槛，避免误杀纯承接
  const eventHit = eventCovered || overlap >= 0.11
  if (!eventHit) return null
  if (sharedCast.length < 1 && overlap < 0.14) return null
  if (!eventCovered && sharedCast.length < 1) return null

  const who = sharedCast.length
    ? sharedCast.slice(0, 3).join('、')
    : (eventFp.slice(0, 20) || '上章末场面')
  return {
    layer: 'hard',
    rule: 'chapter_seam_replay',
    message:
      `章缝回放：本章开篇再次铺开上章末已发生的情节`
      + (eventFp ? `「${eventFp.slice(0, 36)}${eventFp.length > 36 ? '…' : ''}」` : '')
      + (sharedCast.length ? `（再现人物：${who}）` : '')
      + '。请从上章已发生事实之后起笔，只写承接与新推进，勿把上章收束再演一遍。',
  }
}

export function detectChapterSeamReplay(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  /** 上章更多正文（用于章中交付重演）；缺省则用 prevChapterTail */
  prevChapterBody?: string
  /** 本章大纲：用于识别「大纲过期 / 拍点倒序后退写」 */
  chapterOutline?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): AuditConflict | null {
  const { content, chapterNumber, prevChapterTail, chapterOutline, prevSnapshot } = args
  if (chapterNumber < 2 || (!prevChapterTail?.trim() && !prevSnapshot && !args.prevChapterBody?.trim())) {
    return null
  }

  const prevTail = (prevChapterTail || args.prevChapterBody || '').trim().slice(-1200)
  const prevBody = (args.prevChapterBody || prevChapterTail || '').trim()
  const opening = content.trim().slice(0, Math.min(content.trim().length, 1800))
  if ([...content.trim()].length < 80) return null

  // 0) 章中交付重演（一饼两吃）：不限开篇
  const bodyReplay = detectChapterBodyEventReplay({
    content,
    chapterNumber,
    prevChapterBody: prevBody,
    prevSnapshot,
  })
  if (bodyReplay) return bodyReplay

  if ([...opening].length < 80) return null

  // 1) 上章末契约对照（地点/经过）+ 在场再进门 + 日内时辰倒退
  const placeHit = detectOpeningAgainstChapterEndSnapshot({
    content,
    chapterNumber,
    prevSnapshot,
  })
  if (placeHit) return placeHit

  const reentryHit = detectChapterSeamPresenceReentry({
    content,
    chapterNumber,
    prevChapterTail,
    prevSnapshot,
  })
  if (reentryHit) return reentryHit

  const quietJump = detectChapterSeamQuietCloseJump({
    content,
    chapterNumber,
    prevChapterTail,
    prevSnapshot,
  })
  if (quietJump) return quietJump

  const prevForTime = prevTailWithSnapshotTime(prevChapterTail, prevSnapshot)
  if (prevForTime.trim()) {
    const timeHit = detectChapterSeamTimeRewind({
      content,
      chapterNumber,
      prevChapterTail: prevForTime,
    })
    if (timeHit) {
      return prevSnapshot
        ? {
          ...timeHit,
          message: `${timeHit.message}（上章末契约：时间=${prevSnapshot.time}；刚发生=${prevSnapshot.last_event}）`,
        }
        : timeHit
    }
  }

  if (!prevTail) return null

  // 2) 大纲拍点倒序 / 落实过期拍点
  const orderHit = detectOutlineBeatOrderRewind({
    content,
    chapterNumber,
    prevChapterTail,
    chapterOutline,
  })
  if (orderHit) return orderHit

  // 3) 过期大纲 + 开篇弱承接（换措辞倒退重开）
  const weakHit = detectStaleOutlineWeakContinuation({
    content,
    chapterNumber,
    prevChapterTail,
    chapterOutline,
  })
  if (weakHit) return weakHit

  // 4) 开篇未进本章大纲前段（无过期拍点时的冷开篇/时空倒退）
  const coldHit = detectChapterSeamColdOpen({
    content,
    chapterNumber,
    prevChapterTail,
    chapterOutline,
    prevSnapshot,
  })
  if (coldHit) return coldHit

  // 5) 上章末冲突高潮被整段换皮重演（如赵大彪对峙再写一遍）
  const climaxHit = detectChapterSeamClimaxReplay({
    content,
    chapterNumber,
    prevChapterTail: prevTail,
    prevSnapshot,
  })
  if (climaxHit) return climaxHit

  if ([...opening].length < 200) return null

  const prevSpeeches = extractSpeeches(prevTail, 6)
  const openSpeeches = extractSpeeches(opening, 10)
  let bestSpeech: { prev: string; cur: string; score: number } | null = null
  const openingNorm = normalizeText(opening)

  for (const p of prevSpeeches) {
    for (const c of openSpeeches) {
      const score = speechOverlap(p, c)
      if (score >= 0.28 && (!bestSpeech || score > bestSpeech.score)) {
        bestSpeech = { prev: p, cur: c, score }
      }
    }
    const np = normalizeText(p)
    if (np.length >= 10) {
      const head = np.slice(0, Math.min(16, np.length))
      if (openingNorm.includes(head)) {
        const score = Math.max(0.4, head.length / Math.max(np.length, 16))
        if (!bestSpeech || score > bestSpeech.score) {
          bestSpeech = { prev: p, cur: p.slice(0, 40), score }
        }
      }
    }
  }

  const sent = sentenceReplayScore(prevTail, opening)
  const jaccard = bigramJaccard(prevTail.slice(-700), opening.slice(0, 1000))
  const lcs = longestCommonSubstringRatio(prevTail, opening)

  const strongSpeech = (bestSpeech?.score ?? 0) >= 0.35
  const midSpeech = (bestSpeech?.score ?? 0) >= 0.28
  const strongSentence = sent.score >= 0.35
  const midSentence = sent.score >= 0.28
  const strongOverlap = jaccard >= 0.22 || lcs.ratio >= 0.08
  const veryStrongOverlap = jaccard >= 0.3 || lcs.ratio >= 0.14

  if (
    strongSpeech
    || strongSentence
    || (midSpeech && (midSentence || strongOverlap))
    || (midSentence && strongOverlap)
    || veryStrongOverlap
  ) {
    const excerpt = (
      bestSpeech?.cur
      || sent.snippet
      || lcs.snippet
      || opening.slice(0, 40)
    ).replace(/\s+/g, ' ').slice(0, 48)
    return {
      layer: 'hard',
      rule: 'chapter_seam_replay',
      message: `章缝回放：本章开篇与上章结尾在关键对白/收束句/场面描写上高度重合（摘录「${excerpt}…」）。请从上章已发生事实之后起笔，只写承接与新冲突，勿把上章高潮再演一遍。`,
    }
  }

  return null
}

export function mergeSeamIntoLocalAudit(
  local: { hard: AuditConflict[]; rule: AuditConflict[] },
  args: {
    content: string
    chapterNumber: number
    prevChapterTail?: string
    prevChapterBody?: string
    chapterOutline?: string
    prevSnapshot?: ChapterEndSnapshot | null
  },
): { hard: AuditConflict[]; rule: AuditConflict[] } {
  const hit = detectChapterSeamReplay(args)
  if (!hit) return local
  if (local.hard.some(h => h.rule === 'chapter_seam_replay')) return local
  return { hard: [...local.hard, hit], rule: local.rule }
}
