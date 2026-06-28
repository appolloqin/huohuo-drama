/**
 * 网文章节正文排版辅助
 * - mapTextPreservingLineBreaks：一致性修正时原样保留 \n
 * - normalizeNovelParagraphs：仅用于初稿本身无分段的长墙（不用于修正后）
 */

/** 仅在非换行片段上变换，原样保留每一段换行序列 */
export function mapTextPreservingLineBreaks(text: string, mapBlock: (block: string) => string): string {
  if (!text) return text
  return text.split(/(\n+)/).map(part => (/^\n+$/.test(part) ? part : mapBlock(part))).join('')
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?…])/).map(s => s.trim()).filter(Boolean)
}

function paragraphBlocks(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split(/\n+/).map(s => s.trim()).filter(Boolean)
}

export function needsParagraphSplit(text: string): boolean {
  const blocks = paragraphBlocks(text)
  if (!blocks.length) return false
  if (blocks.length === 1) return blocks[0]!.length > 120
  return Math.max(...blocks.map(b => b.length)) > 320
}

function isDialogueHeavy(sentence: string): boolean {
  return /「/.test(sentence) || /」/.test(sentence)
}

function isShortOnomatopoeia(sentence: string): boolean {
  const t = sentence.trim()
  return t.length <= 24 && /——/.test(t)
}

function splitWallIntoParagraphs(text: string): string[] {
  const sentences = splitSentences(text)
  if (sentences.length <= 1) return [text.trim()]

  const out: string[] = []
  let bucket: string[] = []
  let bucketChars = 0

  const flush = () => {
    if (!bucket.length) return
    out.push(bucket.join(''))
    bucket = []
    bucketChars = 0
  }

  for (const sent of sentences) {
    if (isShortOnomatopoeia(sent)) {
      flush()
      out.push(sent)
      continue
    }

    if (isDialogueHeavy(sent) && bucket.length && bucketChars > 50) {
      flush()
    }

    bucket.push(sent)
    bucketChars += sent.length

    if (bucket.length >= 3 || (bucket.length >= 2 && bucketChars >= 100) || bucketChars >= 240) {
      flush()
    }
  }
  flush()
  return out.filter(Boolean)
}

/** 规范化段间空行；无分段或段落过长时按句拆段 */
export function normalizeNovelParagraphs(text: string): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return trimmed

  if (!needsParagraphSplit(trimmed)) {
    return trimmed
  }

  const flat = paragraphBlocks(trimmed).join('')
  const paragraphs = splitWallIntoParagraphs(flat)
  return paragraphs.length ? paragraphs.join('\n\n') : flat
}
