import crypto from 'crypto'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'

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
  suggestions?: AiDetectionSuggestion[]
}

const SIGNAL_THRESHOLD = 0.55

const AI_TRANSITIONS = [
  '然而', '因此', '随后', '与此同时', '不禁', '竟然', '仿佛', '宛如',
  '缓缓', '微微', '淡淡', '静静', '默默', '不由得', '忍不住',
  '眼中闪过', '心头一紧', '于是乎', '紧接着', '刹那间', '话音刚落',
  '心中暗道', '嘴角微微', '空气仿佛', '时间仿佛',
]

const AI_CONNECTORS = [
  '首先', '其次', '再次', '最后', '总之', '综上所述', '一方面', '另一方面',
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

function bigramRepetitionScore(text: string): number {
  const chars = [...text.replace(/\s/g, '')]
  if (chars.length < 20) return 0.5
  const bigrams = new Map<string, number>()
  for (let i = 0; i < chars.length - 1; i++) {
    const bg = chars[i] + chars[i + 1]
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1)
  }
  let weighted = 0
  let total = 0
  for (const [, c] of bigrams) {
    total++
    if (c >= 4) weighted += 1
    else if (c === 3) weighted += 0.7
    else if (c === 2) weighted += 0.35
  }
  if (total === 0) return 0.5
  return Math.min(1, weighted / (total * 0.12))
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
  const chars = [...text.replace(/\s/g, '')]
  if (chars.length < 20) return []
  const bigrams = new Map<string, { count: number; firstIndex: number }>()
  for (let i = 0; i < chars.length - 1; i++) {
    const bg = chars[i] + chars[i + 1]
    const rec = bigrams.get(bg) || { count: 0, firstIndex: i }
    rec.count++
    bigrams.set(bg, rec)
  }
  return [...bigrams.entries()]
    .filter(([, v]) => v.count >= 4)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2)
    .map(([bigram, rec]) => {
      const index = findBigramIndexInText(text, bigram)
      return buildSuggestion(text, index, index + bigram.length, {
        kind: 'phrase_repetition',
        signal_key: 'phrase_repetition',
        bigram,
        count: rec.count,
        match_text: bigram,
      })
    })
}

function findColloquialSuggestion(text: string, signalVal: number): AiDetectionSuggestion | null {
  if (signalVal < SIGNAL_THRESHOLD) return null
  const dialogueRe = /「([^」]{4,80})」/g
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
  if (signalVal < SIGNAL_THRESHOLD) return null
  const chars = [...text.replace(/\s/g, '')]
  if (chars.length < 30) return null
  const ratio = new Set(chars).size / chars.length
  if (ratio >= 0.22 && ratio <= 0.48) return null
  const index = Math.floor(text.length / 3)
  const end = Math.min(text.length, index + 48)
  return buildSuggestion(text, index, end, {
    kind: 'lexical',
    signal_key: 'lexical_pattern',
    match_text: text.slice(index, end),
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
