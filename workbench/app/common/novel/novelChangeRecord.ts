/** 编辑区只展示小说正文；【变更记录】与章末事件摘要为系统元数据 */

/** 规范化后的标题行 */
const CHANGE_RECORD_RE = /^【变更记录】/m
const CHANGE_RECORD_SPLIT_RE = /(?=^【变更记录】)/m
/** 结构化块：至少一条「- 维: …」+「因果:」≥4 字 */
const STRUCTURED_CHANGE_RE =
  /(?:^|\n)\s*[-*]\s*[^:：\n]+[:：][^\n]+\n\s*因果\s*[:：]\s*\S{4,}/

/** 兼容 ---本章事件摘要： / 【本章事件摘要】 等变体 */
const CHAPTER_END_META_RE =
  /(?:^|\n)(?:---\s*\n*\s*)?(?:【\s*本章事件摘要\s*】|本章事件摘要)(?:\s*[（(][^)）]*[)）])?\s*[：:]?/

function canonicalizeChangeRecordHeaders(text: string): string {
  return (text || '').replace(
    /(^|\n)[ \t]*(?:#{1,3}[ \t]*)?(?:\*{1,2}[ \t]*)?【[ \t]*变更记录[ \t]*】(?:[ \t]*\*{1,2})?[ \t]*(?=\r?\n|$)/g,
    '$1【变更记录】',
  )
}

function stripChapterEndMeta(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const n = [...trimmed].length
  const re = new RegExp(CHAPTER_END_META_RE.source, 'g')
  let best = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    let idx = m.index
    if (trimmed[idx] === '\n') idx += 1
    const offsetChars = [...trimmed.slice(0, idx)].length
    if (offsetChars >= n * 0.55 || n - offsetChars <= 900) best = idx
  }
  if (best < 0) return text
  return trimmed.slice(0, best).replace(/\s+$/, '')
}

function stripChangeRecordHeader(block: string): string {
  return canonicalizeChangeRecordHeaders(block)
    .replace(/^【变更记录】\s*/m, '')
    .trim()
}

function isChangeRecordMetaLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^[-*]\s*[^:：\n]+[:：]/.test(t)) return true
  if (/^[-*]\s*.*无状态变化/.test(t)) return true
  if (/^(因果|触发|代价|感知|耗时)\s*[:：]/.test(t)) return true
  return false
}

function looksLikeChangeEntryStart(line: string): boolean {
  const t = line.trim()
  return /^[-*]\s*[^:：\n]+[:：]/.test(t) || /^[-*]\s*.*无状态变化/.test(t)
}

function ensureChangeRecordHeader(block: string): string {
  const t = (block || '').trim()
  if (!t) return t
  if (CHANGE_RECORD_RE.test(t)) return t
  return `【变更记录】\n${t}`
}

function splitStructuredBlockAndTrailingProse(block: string): {
  changeBlock: string
  trailingProse: string
} {
  const raw = block.trim()
  if (!raw) return { changeBlock: '', trailingProse: '' }
  const lines = raw.split(/\r?\n/)
  let i = 0
  if (CHANGE_RECORD_RE.test((lines[0] || '').trim())) i = 1
  let lastMetaIdx = i - 1
  for (; i < lines.length; i++) {
    if (isChangeRecordMetaLine(lines[i]!)) {
      if (lines[i]!.trim()) lastMetaIdx = i
      continue
    }
    break
  }
  if (i >= lines.length) return { changeBlock: ensureChangeRecordHeader(raw), trailingProse: '' }
  const changeLines = lines.slice(0, Math.max(lastMetaIdx + 1, 1))
  const trailingLines = lines.slice(lastMetaIdx + 1)
  while (trailingLines.length && !trailingLines[0]!.trim()) trailingLines.shift()
  return {
    changeBlock: ensureChangeRecordHeader(changeLines.join('\n').trim()),
    trailingProse: trailingLines.join('\n').trim(),
  }
}

function isStructuredChangeRecordBlock(block: string): boolean {
  const b = canonicalizeChangeRecordHeaders(block || '')
  if (STRUCTURED_CHANGE_RE.test(b)) return true
  if (/无状态变化/.test(b) && /因果\s*[:：]\s*\S{4,}/.test(b)) return true
  return false
}

function peelOrphanedStructuredFromProse(prose: string): {
  prose: string
  changeBlocks: string[]
} {
  const raw = prose.trim()
  if (!raw) return { prose: '', changeBlocks: [] }
  if (!STRUCTURED_CHANGE_RE.test(raw) && !(/无状态变化/.test(raw) && /因果\s*[:：]\s*\S{4,}/.test(raw))) {
    return { prose: raw, changeBlocks: [] }
  }

  const lines = raw.split(/\r?\n/)
  const keep = new Array<boolean>(lines.length).fill(true)
  const changeBlocks: string[] = []
  let i = 0
  while (i < lines.length) {
    if (!looksLikeChangeEntryStart(lines[i]!)) {
      i += 1
      continue
    }
    let j = i
    let lastNonEmpty = i
    while (j < lines.length && isChangeRecordMetaLine(lines[j]!)) {
      if (lines[j]!.trim()) lastNonEmpty = j
      j += 1
    }
    const chunk = lines.slice(i, lastNonEmpty + 1).join('\n')
    if (isStructuredChangeRecordBlock(chunk) || isStructuredChangeRecordBlock(ensureChangeRecordHeader(chunk))) {
      changeBlocks.push(ensureChangeRecordHeader(chunk))
      for (let k = i; k <= lastNonEmpty; k++) keep[k] = false
      i = lastNonEmpty + 1
      continue
    }
    i += 1
  }

  if (!changeBlocks.length) return { prose: raw, changeBlocks: [] }

  const out: string[] = []
  for (let k = 0; k < lines.length; k++) {
    if (keep[k]) out.push(lines[k]!)
  }
  return {
    prose: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    changeBlocks,
  }
}

/**
 * 伪【变更记录】回收为正文；真结构化块（含无标题孤儿条目）剥离出编辑区。
 */
export function stripNovelChangeRecord(text: string): string {
  const trimmed = canonicalizeChangeRecordHeaders(text).trim()
  if (!trimmed) return trimmed

  const proseParts: string[] = []

  if (CHANGE_RECORD_RE.test(trimmed)) {
    const parts = trimmed.split(CHANGE_RECORD_SPLIT_RE)
    for (const part of parts) {
      const t = part.trim()
      if (!t) continue
      if (!CHANGE_RECORD_RE.test(t)) {
        proseParts.push(t)
        continue
      }
      if (isStructuredChangeRecordBlock(t)) {
        const { trailingProse } = splitStructuredBlockAndTrailingProse(t)
        if (trailingProse) proseParts.push(trailingProse)
      } else {
        const body = stripChangeRecordHeader(t)
        if (body) proseParts.push(body)
      }
    }
  } else {
    proseParts.push(trimmed)
  }

  const peeled = peelOrphanedStructuredFromProse(proseParts.join('\n\n').trim())
  return stripChapterEndMeta(peeled.prose)
}
