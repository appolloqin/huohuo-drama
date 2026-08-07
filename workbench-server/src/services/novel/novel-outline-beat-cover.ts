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
