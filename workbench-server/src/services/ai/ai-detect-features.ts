/**
 * S1 统计特征包：一次扫描产出全部原始特征值（纯函数，零 LLM/DB 依赖）。
 * 原始值不做判决；判决在 ai-detect-calibration 的分位点表 + ai-detect-fusion。
 * 修复旧缺陷：字种比/标点密度不再手动分段打分（spec §5.1）。
 */
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { NOVEL_AI_TRANSITION_TELLS } from '../../common/novel/novel-ai-tells.js'

// 注意去重：同一短语出现两次会让 tells_density 双倍计数
const CONNECTORS = [
  '总之', '综上所述', '一方面', '另一方面', '由此可见', '毫无疑问', '不得不说', '与此同时',
  '首先', '其次', '此外', '值得注意的是', '需要指出的是', '进一步而言', '总而言之',
]

function chars(text: string): string[] { return [...text.replace(/\s+/g, '')] }
export function coefficientOfVariation(lengths: number[]): number {
  if (lengths.length < 2) return 0.5
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  if (mean === 0) return 0
  const v = lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length
  return Math.sqrt(v) / mean
}
export function sentenceCv(lines: string[]): number {
  return coefficientOfVariation(lines.map((s) => countNovelChars(s)))
}

function splitSentences(text: string): string[] {
  return text.split(/[。！？…]+/).map((s) => s.trim()).filter((s) => countNovelChars(s) >= 2)
}
function splitParagraphs(text: string): string[] {
  return text.split(/\n+/).map((s) => s.trim()).filter((s) => countNovelChars(s) >= 4)
}

/** 套话表合并去重：两表有交集（如「与此同时」），且短词是长词子串时（总之⊂总而言之）会二次计数 */
function dedupePhraseList(list: string[]): string[] {
  const sorted = [...new Set(list)].sort((a, b) => b.length - a.length)
  return sorted.filter((p) => !sorted.some((q) => q !== p && q.includes(p)))
}
const ALL_TELLS = dedupePhraseList([...NOVEL_AI_TRANSITION_TELLS, ...CONNECTORS])

export type RawFeatures = {
  char_count: number
  sentence_len_cv: number
  para_len_cv: number
  char_ttr: number
  char_entropy: number
  bigram_repeat: number
  trigram_repeat: number
  punct_density: number
  dash_density: number
  quote_density: number
  opening_pattern_entropy: number
  syntactic_template_index: number
  dialogue_len_cv: number
  tag_variety: number
  tells_density: number
  colloquial_density: number
}
export const FEATURE_RAW_KEYS: ReadonlyArray<keyof RawFeatures> = [
  'sentence_len_cv', 'para_len_cv', 'char_ttr', 'char_entropy', 'bigram_repeat', 'trigram_repeat',
  'punct_density', 'dash_density', 'quote_density', 'opening_pattern_entropy',
  'syntactic_template_index', 'dialogue_len_cv', 'tag_variety', 'tells_density', 'colloquial_density',
]

function gramRepeat(arr: string[], n: number): number {
  if (arr.length < n + 1) return 0
  const seen = new Set<string>()
  let total = 0
  for (let i = 0; i + n <= arr.length; i++) { seen.add(arr.slice(i, i + n).join('')); total++ }
  return total > 0 ? 1 - seen.size / total : 0
}
function gramEntropy(arr: string[], n: number): number {
  if (arr.length < n) return 0
  const freq = new Map<string, number>()
  let total = 0
  for (let i = 0; i + n <= arr.length; i++) {
    const k = arr.slice(i, i + n).join('')
    freq.set(k, (freq.get(k) || 0) + 1); total++
  }
  let h = 0
  for (const c of freq.values()) { const p = c / total; if (p > 0) h -= p * Math.log2(p) }
  return h
}
function density(count: number, charCount: number): number {
  return charCount > 0 ? count / charCount : 0
}
function countSubstring(text: string, needle: string): number {
  let n = 0, i = 0
  while ((i = text.indexOf(needle, i)) !== -1) { n++; i += needle.length || 1 }
  return n
}

export function extractRawFeatures(text: string): RawFeatures {
  const trimmed = (text || '').trim()
  const arr = chars(trimmed)
  const charCount = arr.length
  const sentences = splitSentences(trimmed)
  const paragraphs = splitParagraphs(trimmed)

  const sentenceLens = sentences.map(countNovelChars)
  const paraLens = paragraphs.map(countNovelChars)

  const punctCount = (trimmed.match(/[，。！？、；：]/g) || []).length
  const dashCount = countSubstring(trimmed, '——') + countSubstring(trimmed, '---')
  const quoteCount = (trimmed.match(/[“「]/g) || []).length

  // 句首 2 字模式：分布越集中 → 模板度越高
  const openings = sentences.map((s) => chars(s).slice(0, 2).join('')).filter((s) => s.length === 2)
  const openingEntropy = gramEntropy(openings, 1) // 句首集合的 1-gram 熵（即首二字种类的香农熵）
  const topOpeningShare = (() => {
    if (!openings.length) return 0
    const freq = new Map<string, number>()
    for (const o of openings) freq.set(o, (freq.get(o) || 0) + 1)
    const top = Math.max(...freq.values())
    return top / openings.length
  })()

  // 引号内节奏与对话归因多样性
  const dialogueRe = /[“"]([^”"]{2,180})[”"]/g
  const dialogueLens: number[] = []
  let m: RegExpExecArray | null
  while ((m = dialogueRe.exec(trimmed)) !== null) dialogueLens.push(countNovelChars(m[1]))
  const tags = [...trimmed.matchAll(/[”"]([^。！？\n]{0,6}?(?:说|道|问|答|喊道|低声))/g)].map((t) => t[1]?.trim() || '')
  const tagVariety = tags.length ? new Set(tags).size / tags.length : 0.5

  const oralCount = (trimmed.match(/[吧呢啊嘛呗咯呀哇噢哦嗯]/g) || []).length
  const tellsCount = ALL_TELLS.reduce((acc, p) => acc + countSubstring(trimmed, p), 0)

  return {
    char_count: charCount,
    sentence_len_cv: coefficientOfVariation(sentenceLens),
    para_len_cv: coefficientOfVariation(paraLens),
    char_ttr: charCount ? new Set(arr).size / charCount : 0,
    char_entropy: gramEntropy(arr, 1),
    bigram_repeat: gramRepeat(arr, 2),
    trigram_repeat: gramRepeat(arr, 3),
    punct_density: density(punctCount, charCount),
    dash_density: density(dashCount, charCount),
    quote_density: density(quoteCount, charCount),
    opening_pattern_entropy: openingEntropy,
    syntactic_template_index: topOpeningShare,
    dialogue_len_cv: coefficientOfVariation(dialogueLens),
    tag_variety: tagVariety,
    tells_density: density(tellsCount, charCount),
    colloquial_density: density(oralCount, charCount),
  }
}

/** 文本字符 bigram 频次 topN（指纹对照用，确定性） */
export function topBigrams(text: string, n = 200): Array<[string, number]> {
  const arr = chars(text)
  const counts = new Map<string, number>()
  for (let i = 0; i + 1 < arr.length; i++) {
    const g = arr[i]! + arr[i + 1]!
    counts.set(g, (counts.get(g) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n)
}
