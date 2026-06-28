/** 从全书大纲文本中提取指定章节的概要 */

export type OutlineVolumeRange = {
  label: string
  start: number
  end: number
  blurb?: string
}

const CN_MAP: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

export function chineseChapterToNumber(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return Number(s)

  if (s.length === 1 && s in CN_MAP) return CN_MAP[s]
  if (s.startsWith('十')) {
    const tail = s.slice(1)
    if (!tail) return 10
    return 10 + (CN_MAP[tail] ?? 0)
  }
  if (s.endsWith('十')) {
    const head = s.slice(0, -1)
    return (CN_MAP[head] ?? 0) * 10
  }
  if (s.includes('十')) {
    const [a, b] = s.split('十')
    const tens = a ? (CN_MAP[a] ?? 0) : 1
    const ones = b ? (CN_MAP[b] ?? 0) : 0
    return tens * 10 + ones
  }
  return CN_MAP[s] ?? null
}

const CHAPTER_HEADER_RE = /^(?:[-*•]\s*)?(?:#{1,3}\s*)?(?:第\s*(\d+)\s*章|第([一二三四五六七八九十百千零两]+)章)\s*[：:.\-—]?\s*(.*)$/

function parseChapterNumber(m: RegExpMatchArray): number | null {
  if (m[1]) return Number(m[1])
  if (m[2]) return chineseChapterToNumber(m[2])
  return null
}

/** 解析全书大纲，返回章号 -> 概要正文 */
export function parseChapterOutlines(fullOutline: string): Map<number, string> {
  const map = new Map<number, string>()
  if (!fullOutline?.trim()) return map

  let section = fullOutline
  const sectionMatch = fullOutline.match(/【?\s*分章概要\s*】?[\s:：]*\n?([\s\S]*)$/i)
    || fullOutline.match(/(?:^|\n)\s*#{1,3}\s*分章概要\s*\n([\s\S]*)$/im)
  if (sectionMatch?.[1]) section = sectionMatch[1]

  let current: number | null = null
  const buf: string[] = []

  const flush = () => {
    if (current !== null) {
      const text = buf.join('\n').trim()
      if (text) map.set(current, text)
    }
    buf.length = 0
  }

  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current !== null) buf.push('')
      continue
    }
    const m = trimmed.match(CHAPTER_HEADER_RE)
    if (m) {
      flush()
      current = parseChapterNumber(m)
      const rest = (m[3] || '').trim()
      if (rest) buf.push(rest)
      continue
    }
    if (/^【.+】$/.test(trimmed) && current !== null) {
      flush()
      current = null
      continue
    }
    if (current !== null) buf.push(trimmed)
  }
  flush()
  return map
}

export function extractChapterOutline(fullOutline: string, chapterNumber: number): string {
  if (!fullOutline?.trim() || chapterNumber < 1) return ''
  const map = parseChapterOutlines(fullOutline)
  return map.get(chapterNumber) || ''
}

/** 从分章行首段提取章节标题（如「坠崖奇遇 / 林萧…」→「坠崖奇遇」） */
export function extractChapterTitleFromRest(rest: string): string {
  if (!rest?.trim()) return ''
  let head = rest.trim().split(/[\/／|｜]/)[0].trim()
  head = head.replace(/^[：:\-\s—]+/, '').trim()
  if (!head) return ''
  if (head.length > 36) return `${head.slice(0, 36)}…`
  return head
}

export function isGenericChapterTitle(title: string | null | undefined, chapterNumber: number): boolean {
  const t = (title || '').trim()
  if (!t) return true
  return new RegExp(`^第\\s*${chapterNumber}\\s*章\\s*$`).test(t)
}

/** 解析全书大纲，返回章号 -> 章节标题 */
export function parseChapterTitles(fullOutline: string): Map<number, string> {
  const map = new Map<number, string>()
  if (!fullOutline?.trim()) return map

  let section = fullOutline
  const sectionMatch = fullOutline.match(/【?\s*分章概要\s*】?[\s:：]*\n?([\s\S]*)$/i)
    || fullOutline.match(/(?:^|\n)\s*#{1,3}\s*分章概要\s*\n([\s\S]*)$/im)
  if (sectionMatch?.[1]) section = sectionMatch[1]

  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(CHAPTER_HEADER_RE)
    if (!m) continue
    const num = parseChapterNumber(m)
    if (num === null) continue
    const title = extractChapterTitleFromRest(m[3] || '')
    if (title) map.set(num, title)
  }
  return map
}

export function extractChapterTitle(fullOutline: string, chapterNumber: number): string {
  if (!fullOutline?.trim() || chapterNumber < 1) return ''
  return parseChapterTitles(fullOutline).get(chapterNumber) || ''
}

export function resolveChapterDisplayTitle(args: {
  episodeTitle: string | null | undefined
  chapterNumber: number
  bookOutline?: string | null
}): string {
  const { episodeTitle, chapterNumber, bookOutline } = args
  const stored = (episodeTitle || '').trim()
  if (stored && !isGenericChapterTitle(stored, chapterNumber)) return stored
  const parsed = bookOutline ? extractChapterTitle(bookOutline, chapterNumber) : ''
  if (parsed) return parsed
  return stored || `第${chapterNumber}章`
}

/** 分章概要中已解析到的最大章号 */
export function getMaxParsedChapterNumber(fullOutline: string): number {
  const map = parseChapterOutlines(fullOutline)
  if (!map.size) return 0
  return Math.max(...map.keys())
}

export function splitEvenChapterRanges(totalChapters: number, chunkSize: number): OutlineVolumeRange[] {
  const size = Math.max(10, chunkSize)
  const out: OutlineVolumeRange[] = []
  for (let start = 1; start <= totalChapters; start += size) {
    const end = Math.min(totalChapters, start + size - 1)
    out.push({ label: `第${start}～${end}章`, start, end })
  }
  return out
}

const VOLUME_RANGE_RE = /第\s*(\d+)\s*[～~\-—]\s*(\d+)\s*章/
const VOLUME_NAME_RE = /第([一二三四五六七八九十百\d]+)卷[《「]([^》」]+)[》」]?/

/** 从【分卷设计】解析各卷章节范围；解析失败则按 chunkSize 均分 */
export function parseVolumeRanges(
  skeleton: string,
  totalChapters: number,
  fallbackChunkSize = 50,
): OutlineVolumeRange[] {
  const startIdx = skeleton.indexOf('【分卷设计】')
  const section = startIdx >= 0
    ? skeleton.slice(startIdx).split(/\n【分章概要】/)[0]
    : skeleton

  const volumes: OutlineVolumeRange[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('【')) continue
    const rangeM = trimmed.match(VOLUME_RANGE_RE)
    if (!rangeM) continue
    const start = Number(rangeM[1])
    const end = Number(rangeM[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) continue
    const volM = trimmed.match(VOLUME_NAME_RE)
    const label = volM ? `第${volM[1]}卷《${volM[2]}》` : `第${start}～${end}章`
    volumes.push({ label, start, end, blurb: trimmed })
  }

  if (!volumes.length) {
    return splitEvenChapterRanges(totalChapters, fallbackChunkSize)
  }

  volumes.sort((a, b) => a.start - b.start)
  return volumes
}

export function validateOutlineChapterCoverage(
  fullOutline: string,
  totalChapters: number,
): { ok: boolean; maxChapter: number; missing: number } {
  const maxChapter = getMaxParsedChapterNumber(fullOutline)
  const missing = Math.max(0, totalChapters - maxChapter)
  return { ok: maxChapter >= totalChapters, maxChapter, missing }
}
