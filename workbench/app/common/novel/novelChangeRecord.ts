/**
 * 对话引号程序归一：英文 "/全角＂/直角「」→ 中文 “”
 *（与服务端 novel-dialogue-quotes 对齐；展示层兜底）
 */
function normalizeNovelDialogueQuotes(text: string): string {
  if (!text) return text
  let out = text
  if (out.includes('「')) {
    for (let i = 0; i < 8; i++) {
      const next = out.replace(/「([^「」]*)」/g, '“$1”')
      if (next === out) break
      out = next
    }
  }
  if (!/["＂〝〞]/.test(out)) return out
  let open = false
  let buf = ''
  for (const ch of out) {
    if (ch === '"' || ch === '＂' || ch === '〝' || ch === '〞') {
      if (ch === '〝') {
        buf += '“'
        open = true
        continue
      }
      if (ch === '〞') {
        buf += '”'
        open = false
        continue
      }
      buf += open ? '”' : '“'
      open = !open
      continue
    }
    if (ch === '“' || ch === '「' || ch === '『') open = true
    else if (ch === '”' || ch === '」' || ch === '』') open = false
    buf += ch
  }
  return buf
}

/** 规范化后的标题行 */
const CHANGE_RECORD_RE = /^【变更记录】/m
const CHANGE_RECORD_SPLIT_RE = /(?=^【变更记录】)/m
/**
 * 结构化块：
 * - 「- 维: …」+「因果:」
 * - 或无维名「甲 → 乙」+「因果:」（模型常漏 `- 人物:`）
 */
const STRUCTURED_CHANGE_RE =
  /(?:^|\n)\s*(?:[-*]\s*[^:：\n]+[:：][^\n]+|(?:[-*]\s*)?[^\n:：【]{1,40}\s*→\s*[^\n:：]{1,40})\n\s*因果\s*[:：]\s*\S{4,}/

/** 兼容 ---本章事件摘要： / 【本章事件摘要】 等变体 */
const CHAPTER_END_META_RE =
  /(?:^|\n)(?:---\s*\n*\s*)?(?:【\s*本章事件摘要\s*】|本章事件摘要)(?:\s*[（(][^)）]*[)）])?\s*[：:]?/

/** 与服务端 novel-change-record.canonicalizeChangeRecordHeaders 对齐 */
function canonicalizeChangeRecordHeaders(text: string): string {
  let t = text || ''
  t = t.replace(/([^\n])([ \t]*)【[ \t]*变更记录[ \t]*】/g, '$1\n【变更记录】')
  t = t.replace(
    /(^|\n)[ \t]*(?:#{1,3}[ \t]*)?(?:\*{1,2}[ \t]*)?【[ \t]*变更记录[ \t]*】(?:[ \t]*\*{1,2})?[ \t]*(?=\r?\n|$|[ \t]*[-*])/g,
    '$1【变更记录】',
  )
  t = t.replace(/^(【变更记录】)[ \t]*([-*])/m, '$1\n$2')
  // 正文后粘条目：……”- 人物/…:  / 当场- 物品/…:
  t = t.replace(/([^\n])[ \t]*(-\s*[^:：\n]{1,48}[:：])/g, '$1\n$2')
  t = t.replace(/([^\n])[ \t]*(因果|触发|代价|感知|耗时)\s*[:：]/g, '$1\n  $2:')
  return t
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

function isArrowStateTransitionLine(line: string): boolean {
  const t = line.trim()
  if (!t || [...t].length > 48) return false
  if (/[。！？!?…]$/.test(t)) return false
  if (/^(因果|触发|代价|感知|耗时)\s*[:：]/.test(t)) return false
  return /^(?:[-*]\s*)?.{1,24}\s*→\s*.{1,24}$/.test(t) && /→/.test(t)
}

const META_SUBFIELD_LINE_RE = /^(因果|触发|代价|感知|耗时)\s*[:：]/

function isMetaSubfieldLine(line: string): boolean {
  return META_SUBFIELD_LINE_RE.test((line || '').trim())
}

function isChangeRecordMetaLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^[-*]\s*[^:：\n]+[:：]/.test(t)) return true
  if (/^[-*]\s*.*无状态变化/.test(t)) return true
  if (isMetaSubfieldLine(t)) return true
  if (isArrowStateTransitionLine(t)) return true
  return false
}

function looksLikeChangeEntryStart(line: string): boolean {
  const t = line.trim()
  if (/^[-*]\s*[^:：\n]+[:：]/.test(t)) return true
  if (/^[-*]\s*.*无状态变化/.test(t)) return true
  if (isArrowStateTransitionLine(t)) return true
  if (isMetaSubfieldLine(t)) return true
  return false
}

/** 不完整变更记录残片：裸子字段，或「- 维:」+ 子字段缺完整因果门槛 */
function isOrphanMetaFragment(chunk: string): boolean {
  const lines = (chunk || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  if (!lines.length) return false
  if (!lines.every(l => isChangeRecordMetaLine(l))) return false
  if (lines.every(isMetaSubfieldLine)) return true
  const hasEntry = lines.some(l =>
    /^[-*]\s*[^:：\n]+[:：]/.test(l)
    || /^[-*]\s*.*无状态变化/.test(l)
    || isArrowStateTransitionLine(l),
  )
  const hasSub = lines.some(isMetaSubfieldLine)
  return hasEntry && hasSub
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
  const raw = canonicalizeChangeRecordHeaders(prose).trim()
  if (!raw) return { prose: '', changeBlocks: [] }
  const hasStructuredGate = STRUCTURED_CHANGE_RE.test(raw)
    || (/无状态变化/.test(raw) && /因果\s*[:：]\s*\S{4,}/.test(raw))
  const hasOrphanSubfields = /(?:^|\n)\s*(?:因果|触发|代价|感知|耗时)\s*[:：]/.test(raw)
  if (!hasStructuredGate && !hasOrphanSubfields) {
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
    const peel = isStructuredChangeRecordBlock(chunk)
      || isStructuredChangeRecordBlock(ensureChangeRecordHeader(chunk))
      || isOrphanMetaFragment(chunk)
    if (peel) {
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
  return normalizeNovelDialogueQuotes(stripChapterEndMeta(peeled.prose))
}
