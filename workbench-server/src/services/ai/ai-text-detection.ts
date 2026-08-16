import crypto from 'crypto'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { NOVEL_AI_TRANSITION_TELLS } from '../../common/novel/novel-ai-tells.js'

export type AiDetectionSignal = {
  key: string
  score: number
}

export type AiDetectionSuggestionKind =
  | 'transition_phrase'
  | 'logical_connector'
  | 'sentence_uniformity'
  | 'paragraph_uniformity'
  | 'phrase_repetition'
  | 'colloquial'
  | 'punctuation'
  | 'lexical'
  | 'perplexity'

export type AiDetectionSuggestion = {
  kind: AiDetectionSuggestionKind
  signal_key: string
  excerpt: string
  /** 原文中的起始偏移（0-based，闭区间） */
  char_start: number
  /** 原文中的结束偏移（0-based，开区间） */
  char_end: number
  /** 1-based 行号 */
  line_number: number
  paragraph_index: number
  /** 1-based 全章句序号 */
  sentence_index: number
  /** 1-based 按正文计字（不含空白）的字位 */
  char_offset: number
  match_text?: string
  phrase?: string
  count?: number
  bigram?: string
}

export const AI_DETECTION_METHOD = 'statistical_v1' as const

export type AiDetectionMethod =
  | typeof AI_DETECTION_METHOD
  | 'perplexity_v1'
  | 'statistical_v1_fallback'

export type AiDetectionResult = {
  probability: number
  confidence: 'low' | 'medium' | 'high'
  verdict: 'likely_human' | 'mixed' | 'likely_ai'
  char_count: number
  content_hash: string
  detected_at: string
  signals: AiDetectionSignal[]
  method: AiDetectionMethod
  elapsed_ms: number
  /** 困惑度检测：PPL 越低越像 AI */
  perplexity?: number
  mean_logprob?: number
  analyzed_tokens?: number
  sampled_char_count?: number
  fallback_reason?: string
  perplexity_model?: string
  /** 写作主模型与困惑度模型是否同系（C2） */
  same_family_detect?: boolean
  ai_detect_warning?: string
  writing_model?: string
  suggestions?: AiDetectionSuggestion[]
  /** 朱雀式分段报告（本站启发式，非朱雀官方分） */
  segments?: import('./ai-detect-segments.js').AiDetectSegment[]
  sampling?: {
    windows: import('./ai-detect-segments.js').AiDetectSamplingWindow[]
  }
  /** 高危段数量（suspected+ai） */
  high_band_count?: number
}

/** 修改建议展示门槛（原 0.55 过高：用词 72% 以外的次高维常被整表吞掉） */
const SUGGESTION_THRESHOLD = 0.38
/** @deprecated 使用 SUGGESTION_THRESHOLD */
const SIGNAL_THRESHOLD = SUGGESTION_THRESHOLD

const AI_TRANSITIONS = [...NOVEL_AI_TRANSITION_TELLS]

/** 议论文套话连接词；勿收「最后/首先」——网文叙事高频，易误伤 */
const AI_CONNECTORS = [
  '总之', '综上所述', '一方面', '另一方面',
  '由此可见', '毫无疑问', '不得不说', '与此同时',
]

function splitSentences(text: string): string[] {
  return text.split(/[。！？…]+/).map(s => s.trim()).filter(s => s.length >= 2)
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(s => s.length >= 4)
}

function coefficientOfVariation(lengths: number[]): number {
  if (lengths.length < 2) return 0.5
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  if (mean === 0) return 0
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length
  return Math.sqrt(variance) / mean
}

function countPhraseMatches(text: string, phrases: string[]): number {
  let count = 0
  for (const phrase of phrases) {
    let idx = 0
    while ((idx = text.indexOf(phrase, idx)) !== -1) {
      count++
      idx += phrase.length
    }
  }
  return count
}

/** 统计子串出现次数 */
function countSubstringOccurrences(text: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = 0
  while ((i = text.indexOf(needle, i)) !== -1) {
    n++
    i += needle.length
  }
  return n
}

/**
 * 短语重复：只量机械 AI 套话密度（了一 / —— / 。他），不量普通人名/物件二字组。
 * 旧版全量 bigram 会把「秦卫国」拆成「秦卫」「卫国」刷到 60%+，去 AI 味空转且误导改专名。
 */
function mechanicalPhraseRepetitionScore(text: string): number {
  const charCount = countNovelChars(text)
  if (charCount < 20) return 0.5
  const leYi = countSubstringOccurrences(text, '了一')
  const emDash = countSubstringOccurrences(text, '——')
    + countSubstringOccurrences(text, '---')
  const pronounStart = (text.match(/[。！？][他她]/g) || []).length
  const hits = leYi + emDash + pronounStart
  const dens = hits / Math.max(charCount / 400, 1)
  if (dens >= 4) return 0.85
  if (dens >= 2.5) return 0.68
  if (dens >= 1.5) return 0.52
  if (dens >= 0.9) return 0.38
  if (dens >= 0.45) return 0.28
  return 0.16
}

/** @deprecated 兼容旧名；语义已改为机械套话密度 */
function bigramRepetitionScore(text: string): number {
  return mechanicalPhraseRepetitionScore(text)
}

/**
 * 高频专名（3～4 字）覆盖的二字组 — 供去 AI 味精修跳过专名目标。
 * 用「整词出现次数」而非滑窗：避免把整句重复切段误当成专名。
 */
export function collectNameCoveredBigrams(text: string, minCount = 4): Set<string> {
  const compact = text.replace(/\s/g, '')
  const covered = new Set<string>()
  if (compact.length < 6) return covered

  const candidates = new Map<string, number>()
  // 候选：正文中连续 3～4 个汉字；按整串 indexOf 计数（步长 1）
  const re = /[\u4e00-\u9fff]{3,4}/g
  let m: RegExpExecArray | null
  const seenAt = new Set<string>()
  while ((m = re.exec(compact)) !== null) {
    const s = m[0]
    // 同一位置只记一次候选键；计数另算
    if (seenAt.has(`${m.index}:${s}`)) continue
    seenAt.add(`${m.index}:${s}`)
    if (!candidates.has(s)) {
      candidates.set(s, countSubstringOccurrences(compact, s))
    }
  }
  // 凝聚度：真名「秦卫国」次数应接近其二字组次数；内容滑片通常更碎
  for (const [name, c] of candidates) {
    if (c < minCount) continue
    const chars = [...name]
    let cohesive = true
    for (let j = 0; j < chars.length - 1; j++) {
      const bg = chars[j]! + chars[j + 1]!
      const bgc = countSubstringOccurrences(compact, bg)
      if (bgc > c * 1.35 + 2) {
        cohesive = false
        break
      }
    }
    if (!cohesive) continue
    for (let j = 0; j < chars.length - 1; j++) {
      covered.add(chars[j]! + chars[j + 1]!)
    }
  }
  return covered
}

function lexicalPatternScore(text: string): number {
  const chars = [...text.replace(/\s/g, '')]
  if (chars.length < 10) return 0.5
  const ratio = new Set(chars).size / chars.length
  if (ratio < 0.15) return 0.82
  if (ratio < 0.22) return 0.68
  if (ratio >= 0.28 && ratio <= 0.42) return 0.72
  if (ratio > 0.55) return 0.38
  return 0.48
}

function punctuationRhythmScore(text: string): number {
  const chars = countNovelChars(text)
  if (chars < 50) return 0.5
  const marks = (text.match(/[，。！？、；：]/g) || []).length
  const perChar = marks / chars
  if (perChar >= 0.018 && perChar <= 0.045) return 0.74
  if (perChar < 0.01 || perChar > 0.065) return 0.32
  return 0.52
}

function paragraphIndexAt(text: string, charIndex: number): number {
  const before = text.slice(0, Math.max(0, charIndex))
  if (!before) return 1
  return before.split(/\n+/).length
}

function sentenceIndexAt(text: string, charIndex: number): number {
  const before = text.slice(0, Math.max(0, charIndex))
  return (before.match(/[。！？…]/g) || []).length + 1
}

function lineNumberAt(text: string, charIndex: number): number {
  const before = text.slice(0, Math.max(0, charIndex))
  return before.split('\n').length
}

function charOffsetAt(text: string, charIndex: number): number {
  return countNovelChars(text.slice(0, Math.max(0, charIndex))) + 1
}

function locateTextSpan(
  text: string,
  charStart: number,
  charEnd: number,
): Pick<
  AiDetectionSuggestion,
  'char_start' | 'char_end' | 'line_number' | 'paragraph_index' | 'sentence_index' | 'char_offset'
> {
  const start = Math.max(0, Math.min(charStart, text.length))
  const end = Math.max(start, Math.min(charEnd, text.length))
  return {
    char_start: start,
    char_end: end,
    line_number: lineNumberAt(text, start),
    paragraph_index: paragraphIndexAt(text, start),
    sentence_index: sentenceIndexAt(text, start),
    char_offset: charOffsetAt(text, start),
  }
}

function buildSuggestion(
  text: string,
  charStart: number,
  charEnd: number,
  base: Omit<
    AiDetectionSuggestion,
    'excerpt' | 'char_start' | 'char_end' | 'line_number' | 'paragraph_index' | 'sentence_index' | 'char_offset'
  >,
): AiDetectionSuggestion {
  const span = locateTextSpan(text, charStart, charEnd)
  const matchText = base.match_text
    || (charEnd > charStart ? text.slice(span.char_start, span.char_end) : undefined)
  return {
    ...base,
    ...span,
    match_text: matchText,
    excerpt: excerptAround(text, span.char_start),
  }
}

function findBigramIndexInText(text: string, bigram: string): number {
  const target = [...bigram]
  if (target.length < 2) return 0
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue
    if (text[i] !== target[0]) continue
    let j = i + 1
    while (j < text.length && /\s/.test(text[j])) j++
    if (j < text.length && text[j] === target[1]) return i
  }
  return 0
}

function excerptAround(text: string, index: number, radius = 30): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius)
  let slice = text.slice(start, end).replace(/\s+/g, ' ')
  if (start > 0) slice = `…${slice}`
  if (end < text.length) slice = `${slice}…`
  return slice.trim()
}

function signalScore(signals: AiDetectionSignal[], key: string): number {
  const found = signals.find(s => s.key === key)
  return found?.score ?? 0
}

function findPhraseSuggestions(
  text: string,
  phrases: string[],
  kind: AiDetectionSuggestionKind,
  signalKey: string,
  signalVal: number,
  maxItems = 4,
): AiDetectionSuggestion[] {
  if (signalVal < SIGNAL_THRESHOLD) return []
  const phraseCounts = new Map<string, number>()
  const occurrences: Array<{ phrase: string; index: number }> = []
  for (const phrase of phrases) {
    let idx = 0
    while ((idx = text.indexOf(phrase, idx)) !== -1) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1)
      occurrences.push({ phrase, index: idx })
      idx += phrase.length || 1
    }
  }
  return occurrences
    .sort((a, b) => a.index - b.index)
    .slice(0, maxItems)
    .map(({ phrase, index }) => buildSuggestion(text, index, index + phrase.length, {
      kind,
      signal_key: signalKey,
      phrase,
      count: phraseCounts.get(phrase) || 1,
      match_text: phrase,
    }))
}

function findUniformSentenceSuggestion(text: string, signalVal: number): AiDetectionSuggestion | null {
  if (signalVal < SIGNAL_THRESHOLD) return null
  const sentences = splitSentences(text)
  if (sentences.length < 4) return null
  const lengths = sentences.map(s => countNovelChars(s))
  let best = { start: 0, len: 1 }
  let runStart = 0
  let runLen = 1
  for (let i = 1; i < sentences.length; i++) {
    const prev = lengths[i - 1]
    const cur = lengths[i]
    const similar = prev >= 8 && cur >= 8
      && Math.abs(prev - cur) / Math.max(prev, cur) <= 0.22
    if (similar) {
      runLen++
    } else {
      if (runLen >= 3 && runLen > best.len) best = { start: runStart, len: runLen }
      runStart = i
      runLen = 1
    }
  }
  if (runLen >= 3 && runLen > best.len) best = { start: runStart, len: runLen }
  if (best.len < 3) return null
  const midIdx = best.start + Math.floor(best.len / 2)
  const mid = sentences[midIdx]
  const pos = text.indexOf(mid.slice(0, Math.min(12, mid.length)))
  const index = pos >= 0 ? pos : 0
  const end = pos >= 0 ? pos + mid.length : Math.min(text.length, index + 40)
  return buildSuggestion(text, index, end, {
    kind: 'sentence_uniformity',
    signal_key: 'sentence_uniformity',
    count: best.len,
    match_text: mid.slice(0, 48),
  })
}

function findUniformParagraphSuggestion(text: string, signalVal: number): AiDetectionSuggestion | null {
  if (signalVal < SIGNAL_THRESHOLD) return null
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length < 3) return null
  const lengths = paragraphs.map(p => countNovelChars(p))
  let best = { start: 0, len: 1 }
  let runStart = 0
  let runLen = 1
  for (let i = 1; i < paragraphs.length; i++) {
    const prev = lengths[i - 1]
    const cur = lengths[i]
    const similar = prev >= 40 && cur >= 40
      && Math.abs(prev - cur) / Math.max(prev, cur) <= 0.25
    if (similar) {
      runLen++
    } else {
      if (runLen >= 2 && runLen > best.len) best = { start: runStart, len: runLen }
      runStart = i
      runLen = 1
    }
  }
  if (runLen >= 2 && runLen > best.len) best = { start: runStart, len: runLen }
  if (best.len < 2) return null
  const paraIdx = best.start + Math.floor(best.len / 2)
  const midPara = paragraphs[paraIdx]
  const pos = text.indexOf(midPara.slice(0, Math.min(20, midPara.length)))
  const index = pos >= 0 ? pos : 0
  const end = pos >= 0 ? pos + midPara.length : Math.min(text.length, index + 60)
  return buildSuggestion(text, index, end, {
    kind: 'paragraph_uniformity',
    signal_key: 'paragraph_uniformity',
    count: best.len,
    match_text: midPara.slice(0, 56),
  })
}

function findRepeatedBigramSuggestions(text: string, signalVal: number): AiDetectionSuggestion[] {
  if (signalVal < SIGNAL_THRESHOLD) return []
  const tells: Array<{ needle: string; count: number }> = [
    { needle: '了一', count: countSubstringOccurrences(text, '了一') },
    { needle: '——', count: countSubstringOccurrences(text, '——') },
  ]
  const pronounHits = [...text.matchAll(/[。！？]([他她])/g)]
  if (pronounHits.length >= 4) {
    const ch = pronounHits[0]?.[1] || '他'
    tells.push({ needle: `。${ch}`, count: pronounHits.length })
  }
  return tells
    .filter(t => t.count >= 4)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((t) => {
      const index = text.indexOf(t.needle)
      const at = index >= 0 ? index : 0
      return buildSuggestion(text, at, at + t.needle.length, {
        kind: 'phrase_repetition',
        signal_key: 'phrase_repetition',
        bigram: t.needle,
        count: t.count,
        match_text: t.needle,
      })
    })
}

function findColloquialSuggestion(text: string, signalVal: number): AiDetectionSuggestion | null {
  if (signalVal < SIGNAL_THRESHOLD) return null
  // 同时认直角引号与中文双引号（生成已统一为 “”）
  const dialogueRe = /[「“]([^」”]{4,80})[」”]/g
  let match: RegExpExecArray | null
  while ((match = dialogueRe.exec(text)) !== null) {
    const inner = match[1]
    if (!/[吧呢啊嘛呗咯呀哇噢哦嗯]/.test(inner)) {
      const index = match.index
      return buildSuggestion(text, index, match.index + match[0].length, {
        kind: 'colloquial',
        signal_key: 'colloquial_markers',
        match_text: match[0],
      })
    }
  }
  // 无对白可点时，找一段偏书面的叙述（避免总钉开篇 50 字造成误解）
  const literary = text.match(/[^。！？\n]{20,72}(?:仿佛|宛如|微微|缓缓|不禁|悄无)[^。！？\n]{0,24}/)
  if (literary && literary.index != null) {
    return buildSuggestion(text, literary.index, literary.index + literary[0].length, {
      kind: 'colloquial',
      signal_key: 'colloquial_markers',
      match_text: literary[0],
    })
  }
  return buildSuggestion(text, 0, Math.min(text.length, 50), {
    kind: 'colloquial',
    signal_key: 'colloquial_markers',
    match_text: text.slice(0, Math.min(40, text.length)),
  })
}

function findPunctuationSuggestion(text: string, signalVal: number): AiDetectionSuggestion | null {
  if (signalVal < SIGNAL_THRESHOLD) return null
  const re = /[^。！？\n]{12,60}[，、][^。！？\n]{12,60}[，、]/g
  const match = re.exec(text)
  if (!match) return null
  return buildSuggestion(text, match.index, match.index + match[0].length, {
    kind: 'punctuation',
    signal_key: 'punctuation_rhythm',
    match_text: match[0],
  })
}

function findLexicalSuggestion(text: string, signalVal: number): AiDetectionSuggestion | null {
  if (signalVal < SUGGESTION_THRESHOLD) return null
  const chars = [...text.replace(/\s/g, '')]
  if (chars.length < 30) return null
  // 注意：lexicalPatternScore 在字种比 0.28～0.42 时反而最高（0.72），
  // 旧逻辑在此区间 return null，导致「用词分布最高却无修改建议」。
  const abstract = text.match(
    /[^。！？\n]{0,16}(?:微微|缓缓|猛地|仿佛|宛如|不禁|悄然|似乎)[^。！？\n]{0,28}/,
  )
  if (abstract && abstract.index != null) {
    return buildSuggestion(text, abstract.index, abstract.index + abstract[0].length, {
      kind: 'lexical',
      signal_key: 'lexical_pattern',
      match_text: abstract[0].slice(0, 56),
    })
  }
  const index = Math.floor(text.length / 3)
  const end = Math.min(text.length, index + 48)
  return buildSuggestion(text, index, end, {
    kind: 'lexical',
    signal_key: 'lexical_pattern',
    match_text: text.slice(index, end).replace(/\s+/g, ' ').slice(0, 56),
  })
}

function findPerplexitySuggestions(
  text: string,
  opts: { perplexity?: number; probability?: number; sampledCharCount?: number },
): AiDetectionSuggestion[] {
  const { perplexity, probability, sampledCharCount } = opts
  if (perplexity == null || probability == null || probability < 55) return []
  const out: AiDetectionSuggestion[] = []
  const sampleNote = sampledCharCount != null && countNovelChars(text) > sampledCharCount
  out.push(buildSuggestion(text, 0, Math.min(text.length, 56), {
    kind: 'perplexity',
    signal_key: 'perplexity',
    count: sampleNote ? sampledCharCount : undefined,
    match_text: text.slice(0, Math.min(48, text.length)),
  }))
  if (perplexity < 12) {
    const mid = Math.floor(text.length / 2)
    const end = Math.min(text.length, mid + 48)
    out.push(buildSuggestion(text, mid, end, {
      kind: 'perplexity',
      signal_key: 'perplexity',
      match_text: text.slice(mid, end),
    }))
  }
  return out
}

export function buildAiDetectionSuggestions(
  text: string,
  signals: AiDetectionSignal[],
  opts?: {
    perplexity?: number
    probability?: number
    sampledCharCount?: number
  },
): AiDetectionSuggestion[] {
  const trimmed = text.trim()
  if (countNovelChars(trimmed) < 80) return []

  const items: AiDetectionSuggestion[] = []

  items.push(...findPhraseSuggestions(
    trimmed,
    AI_TRANSITIONS,
    'transition_phrase',
    'transition_patterns',
    signalScore(signals, 'transition_patterns'),
  ))
  items.push(...findPhraseSuggestions(
    trimmed,
    AI_CONNECTORS,
    'logical_connector',
    'logical_connectors',
    signalScore(signals, 'logical_connectors'),
  ))

  const sentUniform = findUniformSentenceSuggestion(trimmed, signalScore(signals, 'sentence_uniformity'))
  if (sentUniform) items.push(sentUniform)

  const paraUniform = findUniformParagraphSuggestion(trimmed, signalScore(signals, 'paragraph_uniformity'))
  if (paraUniform) items.push(paraUniform)

  items.push(...findRepeatedBigramSuggestions(trimmed, signalScore(signals, 'phrase_repetition')))

  const colloquial = findColloquialSuggestion(trimmed, signalScore(signals, 'colloquial_markers'))
  if (colloquial) items.push(colloquial)

  const punct = findPunctuationSuggestion(trimmed, signalScore(signals, 'punctuation_rhythm'))
  if (punct) items.push(punct)

  const lexical = findLexicalSuggestion(trimmed, signalScore(signals, 'lexical_pattern'))
  if (lexical) items.push(lexical)

  items.push(...findPerplexitySuggestions(trimmed, opts || {}))

  // 最高维若仍无定位建议，补一条，避免面板「只有条、没有改哪里」
  ensureTopSignalSuggestions(trimmed, signals, items)

  const seen = new Set<string>()
  const deduped: AiDetectionSuggestion[] = []
  for (const item of items) {
    const key = `${item.kind}:${item.char_start}:${item.match_text || item.phrase || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped.slice(0, 12)
}

function fallbackSuggestionForSignal(text: string, signalKey: string): AiDetectionSuggestion | null {
  const kindMap: Partial<Record<string, AiDetectionSuggestionKind>> = {
    sentence_uniformity: 'sentence_uniformity',
    paragraph_uniformity: 'paragraph_uniformity',
    transition_patterns: 'transition_phrase',
    logical_connectors: 'logical_connector',
    lexical_pattern: 'lexical',
    phrase_repetition: 'phrase_repetition',
    punctuation_rhythm: 'punctuation',
    colloquial_markers: 'colloquial',
  }
  const kind = kindMap[signalKey]
  if (!kind) return null
  let specific: AiDetectionSuggestion | null = null
  if (signalKey === 'lexical_pattern') specific = findLexicalSuggestion(text, 1)
  else if (signalKey === 'sentence_uniformity') specific = findUniformSentenceSuggestion(text, 1)
  else if (signalKey === 'paragraph_uniformity') specific = findUniformParagraphSuggestion(text, 1)
  else if (signalKey === 'colloquial_markers') specific = findColloquialSuggestion(text, 1)
  else if (signalKey === 'punctuation_rhythm') specific = findPunctuationSuggestion(text, 1)
  else if (signalKey === 'phrase_repetition') {
    // 无机械套话命中时不要造空「短语重复」建议（会显示「」重复 0 次）
    return findRepeatedBigramSuggestions(text, 1)[0] || null
  }
  if (specific) return specific
  const index = Math.floor(text.length / 4)
  const end = Math.min(text.length, index + 48)
  const slice = text.slice(index, end).replace(/\s+/g, ' ').slice(0, 48)
  if (!slice.trim()) return null
  return buildSuggestion(text, index, end, {
    kind,
    signal_key: signalKey,
    match_text: slice,
  })
}

function ensureTopSignalSuggestions(
  text: string,
  signals: AiDetectionSignal[],
  items: AiDetectionSuggestion[],
  maxAdd = 3,
) {
  const covered = new Set(items.map(i => i.signal_key))
  const ranked = signals.slice().sort((a, b) => b.score - a.score)
  let added = 0
  for (const s of ranked) {
    if (added >= maxAdd) break
    if (s.score < SUGGESTION_THRESHOLD) break
    if (covered.has(s.key)) continue
    const tip = fallbackSuggestionForSignal(text, s.key)
    if (!tip) continue
    items.push(tip)
    covered.add(s.key)
    added += 1
  }
}

function colloquialMarkerScore(text: string): number {
  const chars = countNovelChars(text)
  if (chars < 50) return 0.5
  const oral = (text.match(/[吧呢啊嘛呗咯呀哇噢哦嗯]/g) || []).length
  const ratio = oral / chars
  if (ratio < 0.002) return 0.68
  if (ratio > 0.01) return 0.22
  return 0.42
}

export function hashNovelContent(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex').slice(0, 16)
}

function buildResult(
  partial: Omit<AiDetectionResult, 'method' | 'elapsed_ms'>,
  elapsedMs: number,
): AiDetectionResult {
  return { ...partial, method: AI_DETECTION_METHOD, elapsed_ms: elapsedMs }
}

export function detectAiText(text: string): AiDetectionResult {
  const started = Date.now()
  const trimmed = text.trim()
  const charCount = countNovelChars(trimmed)
  const detectedAt = new Date().toISOString()
  const contentHash = hashNovelContent(trimmed)

  if (charCount < 80) {
    return buildResult({
      probability: 50,
      confidence: 'low',
      verdict: 'mixed',
      char_count: charCount,
      content_hash: contentHash,
      detected_at: detectedAt,
      signals: [],
      suggestions: [],
    }, Date.now() - started)
  }

  const sentences = splitSentences(trimmed)
  const sentLengths = sentences.map(s => countNovelChars(s))
  const sentCV = coefficientOfVariation(sentLengths)
  const sentenceUniformity = sentCV < 0.28 ? 0.86 : sentCV < 0.38 ? 0.66 : sentCV < 0.55 ? 0.44 : 0.24

  const paragraphs = splitParagraphs(trimmed)
  const paraLengths = paragraphs.map(p => countNovelChars(p))
  const paraCV = coefficientOfVariation(paraLengths)
  const paragraphUniformity = paraCV < 0.35 ? 0.8 : paraCV < 0.5 ? 0.54 : 0.28

  const transitionDensity = countPhraseMatches(trimmed, AI_TRANSITIONS) / Math.max(charCount / 500, 1)
  const transitionPatterns = Math.min(1, transitionDensity / 2.8)

  const connectorDensity = countPhraseMatches(trimmed, AI_CONNECTORS) / Math.max(charCount / 800, 1)
  const logicalConnectors = Math.min(1, connectorDensity / 1.5)

  const phraseRepetition = bigramRepetitionScore(trimmed)
  const lexicalPattern = lexicalPatternScore(trimmed)
  const punctuationRhythm = punctuationRhythmScore(trimmed)
  const colloquialMarkers = colloquialMarkerScore(trimmed)

  const raw =
    sentenceUniformity * 0.18 +
    paragraphUniformity * 0.12 +
    transitionPatterns * 0.20 +
    logicalConnectors * 0.08 +
    lexicalPattern * 0.12 +
    phraseRepetition * 0.12 +
    punctuationRhythm * 0.10 +
    colloquialMarkers * 0.08

  const probability = Math.round(Math.min(97, Math.max(4, raw * 100)))
  const confidence: AiDetectionResult['confidence'] =
    charCount < 300 ? 'low' : charCount < 800 ? 'medium' : 'high'
  const verdict: AiDetectionResult['verdict'] =
    probability >= 65 ? 'likely_ai' : probability >= 40 ? 'mixed' : 'likely_human'

  const signals: AiDetectionSignal[] = [
    { key: 'sentence_uniformity', score: sentenceUniformity },
    { key: 'paragraph_uniformity', score: paragraphUniformity },
    { key: 'transition_patterns', score: transitionPatterns },
    { key: 'logical_connectors', score: logicalConnectors },
    { key: 'lexical_pattern', score: lexicalPattern },
    { key: 'phrase_repetition', score: phraseRepetition },
    { key: 'punctuation_rhythm', score: punctuationRhythm },
    { key: 'colloquial_markers', score: colloquialMarkers },
  ]

  return buildResult({
    probability,
    confidence,
    verdict,
    char_count: charCount,
    content_hash: contentHash,
    detected_at: detectedAt,
    signals,
    suggestions: buildAiDetectionSuggestions(trimmed, signals, { probability }),
  }, Date.now() - started)
}
