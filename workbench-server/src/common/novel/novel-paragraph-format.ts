/**
 * 网文章节正文排版辅助
 * - mapTextPreservingLineBreaks：一致性修正时原样保留 \n
 * - normalizeNovelParagraphs / toNaturalNovelParagraphs：长墙拆段、碎行合并为自然短段
 * - 目标：叙述 1～3 句一段（硬上限 3），段间空一行；忌诗化一句一段，也忌多句糊墙
 */

/** 仅在非换行片段上变换，原样保留每一段换行序列 */
export function mapTextPreservingLineBreaks(text: string, mapBlock: (block: string) => string): string {
  if (!text) return text
  return text.split(/(\n+)/).map(part => (/^\n+$/.test(part) ? part : mapBlock(part))).join('')
}

/** 按句末标点拆句；勿在省略号「……」处断开；勿在「句末+收引号」处断开 */
function splitSentences(text: string): string[] {
  // “十九。” / 「走吧。」 —— 句号后紧跟收引号时必须同属一句，否则会变成：
  // “十九。\n\n”苏婉…
  return text
    .split(/(?<=[。！？!?])(?![」』”'"])/)
    .map(s => s.trim())
    .filter(Boolean)
}

function paragraphBlocks(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split(/\n+/).map(s => s.trim()).filter(Boolean)
}

function nonEmptyLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n').map(s => s.trim()).filter(Boolean)
}

/** 原稿是否为短行网文（近一句一行）：行多、行均长短 */
export function isShortLineNovelLayout(text: string): boolean {
  const lines = nonEmptyLines(text)
  if (lines.length < 8) return false
  const avg = lines.reduce((sum, line) => sum + line.length, 0) / lines.length
  const shortRatio = lines.filter(line => line.length <= 80).length / lines.length
  const multiSentenceLines = lines.filter(line => (line.match(/[。！？!?]/g) || []).length >= 2).length
  return avg <= 58 && shortRatio >= 0.72 && multiSentenceLines / lines.length <= 0.25
}

/** 过碎：大量极短行 / 一句一段诗化（需合并成自然短段） */
export function isOverFragmentedLayout(text: string): boolean {
  const lines = nonEmptyLines(text)
  if (lines.length < 5) return false
  const avg = lines.reduce((sum, line) => sum + line.length, 0) / lines.length
  const veryShortRatio = lines.filter(line => line.length <= 28).length / lines.length
  const oneSentenceRatio = lines.filter(line => (line.match(/[。！？!?]/g) || []).length === 1).length / lines.length
  // 几乎每行恰好一句、行均不长 → 诗化碎行
  if (oneSentenceRatio >= 0.75 && avg <= 58) return true
  if (avg <= 42) return true
  if (veryShortRatio >= 0.22 && oneSentenceRatio >= 0.7) return true
  return false
}

/** @deprecated 易导致过碎；请用 toNaturalNovelParagraphs */
export function toSentencePerLineLayout(text: string): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return trimmed
  const sentences = splitSentences(trimmed.replace(/\n+/g, ''))
  if (sentences.length <= 1) return trimmed
  return sentences.join('\n')
}

export function hasMultiSentenceLines(text: string): boolean {
  return nonEmptyLines(text).some((line) => (line.match(/[。！？!?]/g) || []).length >= 2)
}

function isDialogueHeavy(sentence: string): boolean {
  return /[「」『』“”]/.test(sentence) || /^["“「『]/.test(sentence.trim())
}

function isShortOnomatopoeia(sentence: string): boolean {
  const t = sentence.trim()
  return t.length <= 24 && /——/.test(t)
}

function isUltraShortFragment(sentence: string): boolean {
  const t = sentence.trim()
  return t.length > 0 && t.length <= 12 && !isDialogueHeavy(t)
}

const MAX_SENTENCES_PER_PARAGRAPH = 3

function sentenceCountInBlock(block: string): number {
  return (block.match(/[。！？!?]/g) || []).length
}

/** 句数/字数换段目标轮转：避免规范化后段落字数过匀（检测 paragraph_uniformity） */
const FLUSH_SENTENCE_TARGETS = [1, 3, 1, 2, 3, 1] as const
const FLUSH_CHAR_TARGETS = [52, 200, 60, 120, 220, 48] as const

function splitWallIntoParagraphs(text: string): string[] {
  const sentences = splitSentences(text)
  if (sentences.length <= 1) return [text.trim()]

  const out: string[] = []
  let bucket: string[] = []
  let bucketChars = 0
  let patternIdx = 0

  const flush = () => {
    if (!bucket.length) return
    out.push(bucket.join(''))
    bucket = []
    bucketChars = 0
    patternIdx += 1
  }

  for (const sent of sentences) {
    if (isShortOnomatopoeia(sent)) {
      flush()
      out.push(sent)
      continue
    }

    // 极短碎句并入下一段（按长度，不按具体词）
    if (isUltraShortFragment(sent) && !bucket.length) {
      bucket.push(sent)
      bucketChars += sent.length
      continue
    }

    if (isDialogueHeavy(sent) && bucket.length && bucketChars > 40) {
      flush()
    }

    bucket.push(sent)
    bucketChars += sent.length

    const sentTarget = FLUSH_SENTENCE_TARGETS[patternIdx % FLUSH_SENTENCE_TARGETS.length]!
    const charTarget = FLUSH_CHAR_TARGETS[patternIdx % FLUSH_CHAR_TARGETS.length]!
    // 硬上限 3 句；换段目标在 1～3 句与短/中/长字数间轮转，打散段落均匀度
    const preferFlush = bucket.length >= sentTarget
      || bucket.length >= MAX_SENTENCES_PER_PARAGRAPH
      || bucketChars >= charTarget
    if (preferFlush && !isUltraShortFragment(sent)) {
      flush()
    }
  }
  flush()
  return out.filter(Boolean)
}

function paragraphLengthCv(blocks: string[]): number {
  if (blocks.length < 2) return 1
  const lens = blocks.map(b => [...b.replace(/\s/g, '')].length)
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length
  if (mean <= 0) return 1
  const variance = lens.reduce((s, l) => s + (l - mean) ** 2, 0) / lens.length
  return Math.sqrt(variance) / mean
}

/** 短拍(1句)/稍长(3句)交替——专治「连续等长段」 */
function splitWallAlternatingShortLong(text: string): string[] {
  const sentences = splitSentences(text)
  if (sentences.length <= 1) return [text.trim()]
  const out: string[] = []
  let i = 0
  let wantShort = true
  while (i < sentences.length) {
    if (wantShort || i === sentences.length - 1) {
      out.push(sentences[i]!)
      i += 1
    } else {
      const n = Math.min(3, sentences.length - i)
      // 优先凑 3 句稍长段；不足则 2
      const take = n >= 3 ? 3 : n
      out.push(sentences.slice(i, i + take).join(''))
      i += take
    }
    wantShort = !wantShort
  }
  return out.filter(Boolean)
}

/**
 * 已分段正文的段落节奏打散：在 ≤3 句/段前提下重切，短拍/中段/稍长交错。
 * 用于润色规范化或去 AI 味后纠偏「连续八段差不多长」。
 */
export function varyNovelParagraphRhythm(text: string): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return trimmed
  const blocks = paragraphBlocks(trimmed)
  if (blocks.length < 3) {
    return enforceMaxSentencesPerParagraph(trimmed)
  }
  const flat = blocks.join('')
  let varied = splitWallIntoParagraphs(flat)
  // 轮转切段后 CV 仍偏低：改用 1↔3 句交替，把均匀度打进检测安全区
  if (paragraphLengthCv(varied) < 0.5 && splitSentences(flat).length >= 4) {
    varied = splitWallAlternatingShortLong(flat)
  }
  return mergeLeadingCloseQuoteParagraphs(
    enforceMaxSentencesPerParagraph(varied.length ? varied.join('\n\n') : trimmed),
  )
}

/**
 * 任一叙述段超过 max 句则按句重切（对话/拟声可 1 句成段，仍受 max 约束）。
 * 生成/润色/去 AI 味收口都可调用，防止「一段塞六七句」。
 */
export function enforceMaxSentencesPerParagraph(
  text: string,
  maxSentences = MAX_SENTENCES_PER_PARAGRAPH,
): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return trimmed
  const blocks = paragraphBlocks(trimmed)
  const out: string[] = []
  for (const block of blocks) {
    if (sentenceCountInBlock(block) <= maxSentences) {
      out.push(block)
      continue
    }
    out.push(...splitWallIntoParagraphs(block))
  }
  return mergeLeadingCloseQuoteParagraphs(mergeOrphanShortParagraphs(out.join('\n\n')))
}

function isOrphanShortBeat(block: string): boolean {
  const t = block.trim()
  if (!t || t.length > 12) return false
  if (isDialogueHeavy(t)) return false
  if (isShortOnomatopoeia(t)) return false
  // 结构判定：极短 + 至多一个句末标点（不绑定具体用词）
  return (t.match(/[。！？!?]/g) || []).length <= 1
}

/**
 * 段首收引号粘回上一段（拆句/模型偶发把 ” 独自成段）。
 */
export function mergeLeadingCloseQuoteParagraphs(text: string): string {
  const blocks = paragraphBlocks(text)
  if (blocks.length < 2) return text.trim()
  const merged: string[] = []
  for (const raw of blocks) {
    const b = raw.trim()
    if (!b) continue
    if (merged.length && /^[」』”'"]/.test(b)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${b}`
      continue
    }
    merged.push(b)
  }
  return merged.join('\n\n')
}

/**
 * 极短独占段并入下一段（按长度/结构，不按具体词）。
 * 文末仍无法合并的极短句：句号改为感叹号（短拍语气）。
 */
export function mergeOrphanShortParagraphs(text: string): string {
  const blocks = paragraphBlocks(mergeLeadingCloseQuoteParagraphs(text))
  if (blocks.length < 2) {
    return blocks.length === 1 ? punchStandaloneBeat(blocks[0]!) : text.trim()
  }

  const merged: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i]!
    const next = blocks[i + 1]
    if (next && isOrphanShortBeat(cur)) {
      merged.push(cur + next)
      i += 1
      continue
    }
    merged.push(cur)
  }

  // 连续极短段多轮合并
  if (merged.length < blocks.length && merged.some(isOrphanShortBeat)) {
    return mergeOrphanShortParagraphs(merged.join('\n\n'))
  }
  return mergeLeadingCloseQuoteParagraphs(merged.map(punchStandaloneBeat).join('\n\n'))
}

/** 仍独占一行的极短拍：凡以句号收束的，统一改为感叹号（不维护词表） */
function punchStandaloneBeat(block: string): string {
  const t = block.trim()
  if (!isOrphanShortBeat(t)) return t
  if (/[！!?]$/.test(t)) return t
  if (/。$/.test(t)) return `${t.slice(0, -1)}！`
  return t
}

/** 合并碎行 / 拆长墙 → 自然短段，段间空一行 */
export function toNaturalNovelParagraphs(text: string): string {
  const trimmed = mergeOrphanShortParagraphs(text.replace(/\r\n/g, '\n').trim())
  if (!trimmed) return trimmed
  const flat = paragraphBlocks(trimmed).join('')
  const paragraphs = splitWallIntoParagraphs(flat)
  return mergeLeadingCloseQuoteParagraphs(
    enforceMaxSentencesPerParagraph(
      mergeOrphanShortParagraphs(paragraphs.length ? paragraphs.join('\n\n') : flat),
    ),
  )
}

/**
 * 排版收口：先并极短独占段；过碎再合成自然短段；过长墙则拆段；最后强制 ≤3 句/段。
 */
export function preserveNovelLineLayout(_reference: string, output: string, _force = false): string {
  let out = mergeOrphanShortParagraphs(output.trim())
  if (!out) return output
  if (isOverFragmentedLayout(out) || isShortLineNovelLayout(out)) {
    out = toNaturalNovelParagraphs(out)
  } else if (needsParagraphSplit(out)) {
    out = normalizeNovelParagraphs(out)
  } else if (!/\n\n/.test(out) && nonEmptyLines(out).length >= 8) {
    const avg = nonEmptyLines(out).reduce((s, l) => s + l.length, 0) / nonEmptyLines(out).length
    if (avg <= 55) out = toNaturalNovelParagraphs(out)
  }
  return mergeLeadingCloseQuoteParagraphs(
    enforceMaxSentencesPerParagraph(mergeOrphanShortParagraphs(out)),
  )
}

export function needsParagraphSplit(text: string): boolean {
  const blocks = paragraphBlocks(text)
  if (!blocks.length) return false
  if (isOverFragmentedLayout(text)) return true
  // 任一段超过 3 句必须拆（比纯字数更贴「1～3 句/段」）
  if (blocks.some(b => sentenceCountInBlock(b) > MAX_SENTENCES_PER_PARAGRAPH)) return true
  if (blocks.length === 1) return blocks[0]!.length > 120
  return Math.max(...blocks.map(b => b.length)) > 320
}

/** 规范化段间空行；无分段或段落过长时按句拆段 */
export function normalizeNovelParagraphs(text: string): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return trimmed
  return toNaturalNovelParagraphs(trimmed)
}
