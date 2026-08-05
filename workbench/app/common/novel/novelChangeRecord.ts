/** 编辑区只展示小说正文；【变更记录】与章末事件摘要为系统元数据 */

const CHANGE_RECORD_RE = /^【变更记录】/m
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

export function stripNovelChangeRecord(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const inputLen = [...trimmed].length
  let out = trimmed
  const idx = out.search(CHANGE_RECORD_RE)
  if (idx >= 0) out = out.slice(0, idx).replace(/\s+$/, '')
  out = stripChapterEndMeta(out)
  // 禁止元数据剥离把整章砍成残篇（误匹配会导致只剩几百字）
  if (inputLen >= 800 && [...out].length < Math.floor(inputLen * 0.5)) {
    return trimmed
  }
  return out
}
