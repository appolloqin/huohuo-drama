/**
 * 大纲拍点覆盖（题材无关）：字面 / 分句 / 锚点命中 / 轻量意译。
 * 供章缝冷开篇与大纲落实共用（本文件不依赖 chapter-seam，避免循环引用）。
 */

const BEAT_STOP = new Set([
  '但是', '然后', '因为', '所以', '已经', '什么', '这个', '那个', '自己', '他们', '我们', '你们',
  '一个', '没有', '不是', '可以', '还是', '只是', '只得', '忽然', '于是', '发现', '身处', '身边',
  '进行', '开始', '继续', '出现', '时候', '之后', '之前', '以及', '或者', '成功', '设置',
])

/** 虚词单字，不参与意译字符重合 */
const FUNC_CHARS = new Set(
  [...'的了在是有和与及他她你我它吗呢吧啊把被让给到从上又也还很都将把被'],
)

function normalizeLite(s: string): string {
  return s.replace(/\s+/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”']/g, '')
}

function charLen(s: string): number {
  return [...s].length
}

/** 与 chapter-seam.phraseAppearsIn 同规则（本地副本，断循环依赖） */
function phraseWindowIn(haystack: string, phrase: string): boolean {
  const h = normalizeLite(haystack)
  const p = normalizeLite(phrase)
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
 * 从拍点抽出锚点：滑动双字/三字（避免步进跳过「剥皮」等关键词）。
 */
export function beatAnchorTokens(phrase: string): string[] {
  const raw = normalizeLite(phrase)
  const cleaned = raw.replace(/[的了在是有和与及他她你我它]/g, '')
  const out: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    if (t.length < 2 || BEAT_STOP.has(t) || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  for (let i = 0; i + 2 <= cleaned.length; i++) {
    push(cleaned.slice(i, i + 2))
  }
  for (let i = 0; i + 3 <= cleaned.length; i++) {
    push(cleaned.slice(i, i + 3))
  }
  if (raw.length >= 3) push(raw.slice(-3))
  if (raw.length >= 2) push(raw.slice(-2))
  return out
}

function tokenHitScore(haystack: string, phrase: string): { hits: string[]; score: number } {
  const h = normalizeLite(haystack)
  const tokens = beatAnchorTokens(phrase)
  const hits = tokens.filter(t => h.includes(t))
  const score = hits.reduce((s, t) => s + (t.length >= 3 ? 2 : 1), 0)
  return { hits, score }
}

/** 内容汉字重合比（题材无关的轻量意译信号） */
function contentCharOverlapRatio(haystack: string, phrase: string): number {
  const pChars = [...normalizeLite(phrase)].filter(c => /[\u4e00-\u9fff]/.test(c) && !FUNC_CHARS.has(c))
  const uniq = [...new Set(pChars)]
  if (uniq.length < 4) return 0
  const h = normalizeLite(haystack)
  const hit = uniq.filter(c => h.includes(c)).length
  return hit / uniq.length
}

function coverBeatPhrase(haystack: string, phrase: string): boolean {
  if (phraseWindowIn(haystack, phrase) || phraseWindowIn(phrase, haystack)) return true
  const { hits, score } = tokenHitScore(haystack, phrase)
  // 至少两个锚点，避免「逼近」等单双字在无关正文里误命中
  if (hits.length < 2) return false
  const hasTri = hits.some(t => t.length >= 3)
  // 滑动锚点会变多：用分数门槛，避免「剥皮+人名」仍因 need 过高被判未覆盖
  if (hits.length >= 3 || score >= 4) return true
  if (hits.length >= 2 && score >= 3) return true
  if (hits.length >= 2 && hasTri) return true
  // 多锚 + 字符重合 → 允许意译（仍要求 ≥2 锚，防单点误杀）
  const overlap = contentCharOverlapRatio(haystack, phrase)
  if (hits.length >= 2 && overlap >= 0.28) return true
  if (hasTri && score >= 3 && overlap >= 0.18) return true
  return false
}

/**
 * 拍点是否已在正文落实：严匹配，或大纲原文锚点覆盖，或轻量意译。
 * 同一拍内若含逗号/顿号分句，任一分句落实即算该拍落实。
 */
export function outlineBeatCoveredIn(haystack: string, phrase: string): boolean {
  if (coverBeatPhrase(haystack, phrase)) return true
  const clauses = phrase.split(/[，,、]/).map(s => s.trim()).filter(s => charLen(s) >= 4)
  if (clauses.length < 2) return false
  return clauses.some(c => coverBeatPhrase(haystack, c))
}

/**
 * 【本章起因】覆盖：施事与结果物须同窗共现，禁止仅物体名词误命中。
 * 例：「苏婉拿出…糠饼」不得因开篇「糠皮/半块饼」就判已落地。
 * 分句（拒绝糠饼，决定进山）须各分句均覆盖。
 */
export function outlineCatalystCoveredIn(haystack: string, phrase: string): boolean {
  const raw = phrase.trim()
  if (!raw) return false
  const clauses = raw.split(/[，,、]/).map(s => s.trim()).filter(s => charLen(s) >= 4)
  if (clauses.length >= 2) {
    return clauses.every(c => outlineCatalystCoveredIn(haystack, c))
  }
  const p = normalizeLite(raw)
  if (p.length < 8) return outlineBeatCoveredIn(haystack, raw)

  const h = normalizeLite(haystack)
  const agent = p.slice(0, 2)
  const right = p.slice(Math.floor(p.length * 0.45))
  const objectTokens = beatAnchorTokens(right).filter(t => t.length >= 2)
  if (!objectTokens.length) return outlineBeatCoveredIn(haystack, raw)

  // 开头像人名时：施事必须出现（挡住「只有糠皮、没有苏婉拿出」）
  const looksLikeName = /^[\u4e00-\u9fff]{2}/.test(p)
  if (looksLikeName && !h.includes(agent)) return false

  const searchFrom = looksLikeName ? Math.max(0, h.indexOf(agent)) : 0
  const window = h.slice(searchFrom, searchFrom + 320)
  if (!objectTokens.some(t => window.includes(t))) return false

  const left = p.slice(0, Math.max(4, Math.floor(p.length * 0.45)))
  const leftAnchors = beatAnchorTokens(left).filter(t => {
    if (t.length < 2) return false
    if (t === agent || t.startsWith(agent) || agent.startsWith(t)) return false
    return true
  })
  if (leftAnchors.some(t => window.includes(t))) return true
  // 意译：共现窗内对整句仍有覆盖（须窗内不止孤立物体词）
  return coverBeatPhrase(window, raw) && charLen(window) >= 20
}

/**
 * 过短片段（常见为章名「精准击杀」）不参与覆盖硬门槛。
 * 有更长拍点时，去掉无标点且 ≤6 字的标题型拍点。
 */
export function filterSubstantiveOutlineBeats(beats: string[]): string[] {
  const cleaned = beats.map(b => b.trim()).filter(b => charLen(b) >= 4)
  const longEnough = cleaned.filter(b => charLen(b) >= 6)
  const base = longEnough.length >= 2 ? longEnough : cleaned.filter(b => charLen(b) >= 6)
  if (base.length < 2) return longEnough.length ? longEnough : cleaned
  return base.filter(b => {
    if (charLen(b) > 6) return true
    // ≤6 且无结构标点 → 章名/标签，不进硬门槛
    if (!/[，,、。；;／/]/.test(b)) return false
    return true
  })
}

function extractTagValue(text: string, label: string): string {
  const src = text || ''
  const startRe = new RegExp(`【${label}】`, 'g')
  let m: RegExpExecArray | null
  let lastIndex = -1
  let lastLen = 0
  while ((m = startRe.exec(src)) !== null) {
    lastIndex = m.index
    lastLen = m[0].length
  }
  if (lastIndex < 0) return ''
  const rest = src.slice(lastIndex + lastLen)
  const nextTag = rest.search(/【/)
  const nextCh = rest.search(/第\s*\d+\s*章/)
  let end = rest.length
  if (nextTag >= 0) end = Math.min(end, nextTag)
  if (nextCh >= 0) end = Math.min(end, nextCh)
  return rest.slice(0, end).replace(/^\s+/, '').replace(/\s+$/, '')
}

/** 开篇压迫冲突物（不含信息增量——卖点/新信息另检，避免「只写恨」即过卖点闸） */
const OPENING_PRESSURE_LABELS = ['恨', '本章起因', '阻碍'] as const

/** 本章大纲里开篇应兑现的冲突物（题材由大纲决定，不靠工分/军粮词表） */
export function extractOutlineOpeningStakePhrases(chapterOutline?: string): string[] {
  if (!chapterOutline?.trim()) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const label of OPENING_PRESSURE_LABELS) {
    const v = extractTagValue(chapterOutline, label).replace(/\s+/g, '').trim()
    if ([...v].length < 4) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export function outlineOpeningConflictCovered(head: string, chapterOutline?: string): boolean {
  const phrases = extractOutlineOpeningStakePhrases(chapterOutline)
  if (!phrases.length || !head.trim()) return false
  return phrases.some(p => outlineBeatCoveredIn(head, p))
}

/** 大纲【信息增量】正文须在章内场面化兑现（有则检；无则放行） */
export function extractOutlineInfoDelta(chapterOutline?: string): string {
  if (!chapterOutline?.trim()) return ''
  return extractTagValue(chapterOutline, '信息增量').replace(/\s+/g, ' ').trim()
}

/**
 * 量级/人数字面（题材无关）：万/亿 + 含千/百的中文数词（如一千二百）+ 阿拉伯数字串。
 * 避免「令牌兵累计一千二百」因只检万/亿而漏强制字面。
 */
export function extractScaleAmountTokensLite(text: string): string[] {
  const t = (text || '').replace(/\s+/g, '')
  if (!t) return []
  const out: string[] = []
  if (t.includes('百万')) out.push('百万')
  if (t.includes('千万')) out.push('千万')
  for (const m of t.matchAll(/(?:[零一二两三四五六七八九十百千]+|[0-9]+)(?:万|亿)/g)) {
    if (m[0]) out.push(m[0])
  }
  // 「一千二百」「三百」等：含千/百且长度≥3 的中文数词（排除单字「千」）
  for (const m of t.matchAll(/[零一二两三四五六七八九十百千]{3,12}/g)) {
    const s = m[0]
    if (/[千百]/.test(s)) out.push(s)
  }
  for (const m of t.matchAll(/\d{3,8}/g)) {
    if (m[0]) out.push(m[0])
  }
  return [...new Set(out)]
}

/**
 * 把【信息增量】拆成要点（按破折号/句读）。
 * 与 emotion-beats 同规则；放在本文件避免 circular import。
 */
export function splitInfoDeltaPointsForCover(raw: string, maxPoints = 6): string[] {
  const t = (raw || '').replace(/\s+/g, ' ').trim()
  if (!t) return []
  const parts = t
    .split(/[——；;。！？]/)
    .map(s => s.replace(/^["「『]+|["」』]+$/g, '').trim())
    .filter(s => [...s].length >= 4)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= maxPoints) break
  }
  if (!out.length) out.push([...t].slice(0, 200).join(''))
  return out
}

/**
 * 去掉因由从句，只留主句断言（题材无关）。
 * 避免「因A揭穿B而投效」因从句动词被整条判成揭穿结果态。
 */
export function infoDeltaPointCoreAssertion(point: string): string {
  let s = (point || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  // 因/因为/由于 … 的举动/行为/做法/缘故；因…而…
  s = s.replace(/因(?:为|由)?[^，。；]{1,48}?(?:的(?:举动|行为|做法|缘故)|而)/g, '')
  // 中部「，因…」纯因由段（到下一逗号/句末）
  s = s.replace(/，因(?:为|由)?[^，。；]{1,40}?(?=，|。|$)/g, '')
  s = s.replace(/\s+/g, ' ').replace(/^[，、；]+|[，、；]+$/g, '').trim()
  return s || (point || '').replace(/\s+/g, ' ').trim()
}

function pointHasResultStateVerb(compact: string): boolean {
  if (!compact) return false
  if (/补(上|交|齐|足)|还清|交齐|结清|缴清|揭穿|识破|曝光|破解|兑现|夺回|拿下|翻盘|救下|到手|坐实|完成|已(经)?(补|交|还|清|成|得)/.test(compact)) {
    return true
  }
  return /补上.{0,16}欠|补交.{0,16}欠/.test(compact)
}

/**
 * 大纲点是否断言「结果/完成态」（题材无关：只看主句断言动词，不看因由从句）。
 */
export function isInfoDeltaResultStatePoint(point: string): boolean {
  const core = infoDeltaPointCoreAssertion(point).replace(/\s+/g, '')
  return pointHasResultStateVerb(core)
}

/** 条目标题/正文是否触及货币单位（题材无关单位表；不枚举债税书情词） */
export function pointTouchesMoneyUnit(text: string): boolean {
  const t = (text || '').replace(/\s+/g, '')
  if (!t) return false
  if (extractMoneyAmountLiterals(t).length) return true
  return /两(?:白银|银子|纹银|碎银)?|元|块|灵石|工分|银/.test(t)
}

/** @deprecated 使用 isInfoDeltaResultStatePoint */
export const isInfoDeltaDebtSettledPoint = isInfoDeltaResultStatePoint

/** 正文是否出现通用「结果已发生」标记（不枚举具体书情名词） */
function contentShowsResultState(content: string): boolean {
  const h = (content || '').replace(/\s+/g, '')
  return /已(经)?(补|交|还|清|成|得|拿|揭|破|夺|救|兑)|补(上|交)(了|清|齐|完)|还清|结清|缴清|揭穿|识破|到手|坐实|翻盘|曝光|破解|兑现|拿下了|夺回了|拿到了|不再欠|账上不再|当众.{0,20}(展开|掷|亮出|摊开|砸下)|截了?回来|归心|投效/.test(h)
}

/** 正文是否仍停在「未完成/旧态/改日再办」且无结果态（与结果态条目标矛盾） */
function contentStuckInPriorState(content: string): boolean {
  const h = (content || '').replace(/\s+/g, '')
  if (contentShowsResultState(content)) return false
  return /还欠|仍欠|尚未|还没|仍未|仍旧欠|还没交|还没还|还未|不曾|未能|改日|另行|容后再|待补|待交|明早.{0,12}(送|交|补)|另立.{0,12}(册|账)/.test(h)
}

/** 金额字面：两百四十两 / 240两 / 800元 …（题材无关单位表） */
export function extractMoneyAmountLiterals(text: string): string[] {
  const t = text || ''
  const out: string[] = []
  const re =
    /(?:\d{1,8}|[零〇一二两三四五六七八九十百千万]{1,12})(?:两(?:白银|银子|纹银|碎银)?|元|块|灵石|工分)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    if (m[0]) out.push(m[0].replace(/\s+/g, ''))
  }
  return [...new Set(out)]
}

function normalizeAmountKey(s: string): string {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/两([百十])/g, '二$1')
}

export function amountsEquivalent(a: string, b: string): boolean {
  return normalizeAmountKey(a) === normalizeAmountKey(b)
}

/** 金额字面须整段命中：禁止「四十两」误命中「两百四十两」 */
export function contentHasMoneyAmount(content: string, amount: string): boolean {
  const h = (content || '').replace(/\s+/g, '')
  const n = normalizeAmountKey(amount)
  if (!n) return false
  const alts = [n, n.replace(/二([百十])/g, '两$1'), (amount || '').replace(/\s+/g, '')]
  const numClass = '零〇一二两三四五六七八九十百千万\\d'
  for (const a of [...new Set(alts)].filter(Boolean)) {
    const re = new RegExp(`(?<![${numClass}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    if (re.test(h)) return true
  }
  return false
}

/** 去掉被更长锁定额包含的短额（四十两 ⊂ 两百四十两） */
function pruneSubstringMoneyAmounts(amounts: string[]): string[] {
  const items = amounts
    .map(raw => ({ raw, key: normalizeAmountKey(raw) }))
    .filter(x => x.key)
    .sort((a, b) => b.key.length - a.key.length)
  const kept: typeof items = []
  for (const it of items) {
    if (kept.some(k => k.key !== it.key && k.key.includes(it.key))) continue
    if (kept.some(k => k.key === it.key)) continue
    kept.push(it)
  }
  return kept.map(k => k.raw)
}

function anchorHitsInWindow(win: string, keys: string[]): number {
  return keys.filter(k => win.includes(k)).length
}

/**
 * 单条结果态信息增量 → 从上下文回收与该条同题的金额字面（题材无关）。
 * 硬前提：主句结果态 + 本条触及货币单位；锚点取自主句（不含因由从句）。
 * 本章信息增量无此条 → 不回收（已完结章不续锁）。
 */
export function collectLockedMoneyForInfoDeltaPoint(
  point: string,
  contexts: string[],
): string[] {
  const p = (point || '').replace(/\s+/g, ' ').trim()
  if (!isInfoDeltaResultStatePoint(p)) return []
  if (!pointTouchesMoneyUnit(p) && !pointTouchesMoneyUnit(infoDeltaPointCoreAssertion(p))) return []
  // 只用主句锚点，避免因由里的地名/人名把全书杂额锁进来
  const keys = beatAnchorTokens(infoDeltaPointCoreAssertion(p)).filter(k => k.length >= 2)
  if (keys.length < 2) return []
  const ctx = (contexts || []).filter(Boolean).join('\n')
  if (!ctx.trim()) return []
  const compact = ctx.replace(/\s+/g, '')
  const locked: string[] = []
  for (const amt of extractMoneyAmountLiterals(ctx)) {
    const a = amt.replace(/\s+/g, '')
    let from = 0
    while (from < compact.length) {
      const i = compact.indexOf(a, from)
      if (i < 0) break
      const win = compact.slice(Math.max(0, i - 48), Math.min(compact.length, i + a.length + 48))
      if (anchorHitsInWindow(win, keys) >= 2) {
        locked.push(amt)
        break
      }
      from = i + a.length
    }
  }
  return pruneSubstringMoneyAmounts(locked)
}

/**
 * 本章【信息增量】内各结果态分条的锁定额并集。
 * 后续章若不再写该结果态条 → 空，不把已完结章的金额继续锁死。
 */
export function collectLockedMoneyForInfoDelta(infoDelta: string, contexts: string[]): string[] {
  const delta = (infoDelta || '').trim()
  if ([...delta].length < 4) return []
  const points = splitInfoDeltaPointsForCover(delta).filter(isInfoDeltaResultStatePoint)
  const bags = points.length ? points : (isInfoDeltaResultStatePoint(delta) ? [delta] : [])
  const locked: string[] = []
  for (const bag of bags) {
    locked.push(...collectLockedMoneyForInfoDeltaPoint(bag, contexts))
  }
  return pruneSubstringMoneyAmounts(locked)
}

/**
 * 本条结果态附近出现与已锁不一致的金额 → 另造（题材无关：窗内 ≥2 锚点）。
 */
export function contentHasForeignLockedAmount(
  content: string,
  locked: string[],
  point: string,
): boolean {
  if (!locked.length) return false
  const keys = beatAnchorTokens(point).filter(k => k.length >= 2)
  if (keys.length < 2) return false
  const compact = (content || '').replace(/\s+/g, '')
  if (!compact) return false
  for (const amt of extractMoneyAmountLiterals(content)) {
    if (locked.some(l => amountsEquivalent(amt, l))) continue
    const a = amt.replace(/\s+/g, '')
    let from = 0
    while (from < compact.length) {
      const i = compact.indexOf(a, from)
      if (i < 0) break
      const win = compact.slice(Math.max(0, i - 48), Math.min(compact.length, i + a.length + 48))
      if (anchorHitsInWindow(win, keys) >= 2) return true
      from = i + a.length
    }
  }
  return false
}

/**
 * 单条信息增量是否在正文落地。
 * 结果态条：须有通用完成标记；若本条从上下文回收到金额字面，须用字面、禁止同题另造。
 */
export function infoDeltaPointCovered(
  content: string,
  point: string,
  opts?: { lockedAmounts?: string[]; amountContexts?: string[] },
): boolean {
  const p = (point || '').replace(/\s+/g, ' ').trim()
  if ([...p].length < 4) return true
  if (isInfoDeltaResultStatePoint(p)) {
    // 结果态：须有通用完成标记；仅「还欠/尚未」等旧态不算
    if (!contentShowsResultState(content)) return false
    if (contentStuckInPriorState(content)) return false
    const locked = (opts?.lockedAmounts && opts.lockedAmounts.length)
      ? opts.lockedAmounts
      : collectLockedMoneyForInfoDeltaPoint(p, opts?.amountContexts || [])
    if (locked.length) {
      if (!locked.some(a => contentHasMoneyAmount(content || '', a))) return false
      if (contentHasForeignLockedAmount(content || '', locked, p)) return false
    }
    // 实质词仍须可检索（去掉结果动词后）；避免任意「已完成」洗白无关增量
    const substance = p
      .replace(/补(上|交|齐|足)|还清|交齐|结清|缴清|揭穿|识破|曝光|破解|兑现|夺回|拿下|翻盘|救下|到手|坐实|完成|已(经)?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if ([...substance.replace(/\s+/g, '')].length >= 2) {
      return outlineBeatCoveredIn(content || '', substance) || outlineBeatCoveredIn(content || '', p)
    }
    return true
  }
  const scales = extractScaleAmountTokensLite(p)
  const h = (content || '').replace(/\s+/g, '')
  if (scales.length && scales.some(s => !h.includes(s))) return false
  return outlineBeatCoveredIn(content || '', p)
}

/**
 * 信息增量落地：逐条须过；结果态条按「本条」回收锁定额（本章无该条则不锁）。
 */
export function outlineInfoDeltaCovered(
  content: string,
  chapterOutline?: string,
  amountContext?: string,
): boolean {
  const delta = extractOutlineInfoDelta(chapterOutline)
  if ([...delta].length < 4) return true
  const points = splitInfoDeltaPointsForCover(delta)
  if (!points.length) return outlineBeatCoveredIn(content || '', delta)
  const contexts = [chapterOutline || '', amountContext || '']
  return points.every(p => infoDeltaPointCovered(content || '', p, { amountContexts: contexts }))
}

/** 须在正文落地的戏剧标签（题材无关；有内容才检） */
export const OUTLINE_DRAMA_LANDING_LABELS = [
  '本章起因',
  '欲望',
  '阻碍',
  '局面变化',
  '人物选择',
  '章末问题',
  '信息增量',
] as const

export type OutlineDramaLandingResult = {
  ok: boolean
  missing: string[]
}

/**
 * 本章大纲关键戏剧标签是否在正文中场面化覆盖。
 * 缺标签或过短 → 不检；有则须 outlineBeatCoveredIn。
 */
export function assertOutlineDramaLanding(
  content: string,
  chapterOutline?: string,
  amountContext?: string,
): OutlineDramaLandingResult {
  if (!chapterOutline?.trim()) return { ok: true, missing: [] }
  const missing: string[] = []
  for (const label of OUTLINE_DRAMA_LANDING_LABELS) {
    const v = extractTagValue(chapterOutline, label).replace(/\s+/g, ' ').trim()
    if ([...v].length < 4) continue
    if (label === '信息增量') {
      if (!outlineInfoDeltaCovered(content, chapterOutline, amountContext)) missing.push(label)
      continue
    }
    if (!outlineBeatCoveredIn(content || '', v)) missing.push(label)
  }
  return { ok: missing.length === 0, missing }
}

