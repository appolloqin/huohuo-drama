/** 编辑区只展示小说正文；【变更记录】与章末事件摘要为系统元数据 */

const CHANGE_RECORD_RE = /^【变更记录】/m
const CHANGE_RECORD_SPLIT_RE = /(?=^【变更记录】)/m
/** 结构化块：至少一条「- 维: …」+「因果:」≥4 字 */
const STRUCTURED_CHANGE_RE =
  /(?:^|\n)\s*[-*]\s*[^:：\n]+[:：][^\n]+\n\s*因果\s*[:：]\s*\S{4,}/

/** 兼容 ---本章事件摘要： / 【本章事件摘要】 等变体 */
const CHAPTER_END_META_RE =
  /(?:^|\n)(?:---\s*\n*\s*)?(?:【\s*本章事件摘要\s*】|本章事件摘要)(?:\s*[（(][^)）]*[)）])?\s*[：:]?/

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
  return block.replace(/^【变更记录】\s*/m, '').trim()
}

function isStructuredChangeRecordBlock(block: string): boolean {
  return STRUCTURED_CHANGE_RE.test(block || '')
}

/**
 * 伪【变更记录】（散文冒充）回收为正文；真结构化块剥离出编辑区。
 * 不再使用「剥离后不足一半则整段保留」——那会把大片伪变更记录留在编辑器里。
 */
export function stripNovelChangeRecord(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  if (!CHANGE_RECORD_RE.test(trimmed)) {
    return stripChapterEndMeta(trimmed)
  }

  const parts = trimmed.split(CHANGE_RECORD_SPLIT_RE)
  const proseParts: string[] = []
  let structured: string | null = null

  for (const part of parts) {
    const t = part.trim()
    if (!t) continue
    if (!CHANGE_RECORD_RE.test(t)) {
      proseParts.push(t)
      continue
    }
    if (isStructuredChangeRecordBlock(t)) {
      if (structured) proseParts.push(stripChangeRecordHeader(structured))
      structured = t
    } else {
      const body = stripChangeRecordHeader(t)
      if (body) proseParts.push(body)
    }
  }

  const prose = proseParts.join('\n\n').trim()
  return stripChapterEndMeta(prose)
}
