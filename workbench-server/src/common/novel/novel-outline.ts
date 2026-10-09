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

/** 章标题硬合同：最多 16 字短名（生成落库前改写用） */
export const CHAPTER_TITLE_MAX_CHARS = 16

/**
 * 与 services/novel-commercial-appeal-isomorph SHUANG_TYPE_SET 同步。
 * 根因：第1～8章强约束【爽型】闭集后，模型常把闭集词误写入「第N章：」标题位，
 * 再把真正场面名塞进括号（如「硬撕（千骑踏平铁狼寨）」）——括号是表象，字段串用才是因。
 */
export const OUTLINE_SHUANG_TYPE_LABELS = [
  '硬撕',
  '拒签',
  '揭穿假账',
  '示弱钓鱼',
  '当众对赌',
  '借力第三方',
] as const

/** 标题位误用的爽型词 + 可选场面夹注 */
export type ShuangTypeAsTitleHit = {
  shuang: string
  /** 「硬撕（千骑踏平铁狼寨）」里的场面名 */
  sceneHint: string
}

/** 检测「第N章：」后是否把【爽型】闭集当成了标题 */
export function matchShuangTypeAsChapterTitle(rest: string): ShuangTypeAsTitleHit | null {
  const raw = stripChapterTitleMetaPrefix((rest || '').trim())
  if (!raw) return null
  const paren = raw.match(/^(.+?)\s*[（(](.+?)[）)]\s*$/)
  const base = (paren ? paren[1] : raw.split(/[—－–]{1,2}|\s+-\s+|[/／|｜]/)[0] || '').trim()
  const sceneHint = paren?.[2]?.trim() || ''
  if (!base) return null
  // 按闭集词长优先，避免短词误伤
  const labels = [...OUTLINE_SHUANG_TYPE_LABELS].sort((a, b) => b.length - a.length)
  for (const shuang of labels) {
    if (base === shuang || base.startsWith(shuang)) {
      return { shuang, sceneHint }
    }
  }
  return null
}

/**
 * 标题括号夹注：如「卯时百兵（穿越当日，卯时）」——主标题合法，
 * 括号内是【本章时间】/【本章地点】等标签被粘进标题位（字段串用，不是「有括号字符」本身）。
 */
export type TitleParenAnnotation = {
  main: string
  note: string
  kind: 'time' | 'place' | 'other'
}

const TITLE_NOTE_TIME_RE =
  /(?:穿越)?当日|[子丑寅卯辰巳午未申酉戌亥]时|[早晚]上|深夜|黎明|拂晓|傍晚|第[一二三四五六七八九十\d]+日|时辰|时刻|凌晨|中午|夜里/

const TITLE_NOTE_PLACE_RE =
  /(?:岭|城|寨|府|庄|镇|村|郡|峰|营|殿|厅|铺|道|堡|谷|山|河|渡|驿)/

export function matchTitleParenAnnotation(rest: string): TitleParenAnnotation | null {
  const raw = stripChapterTitleMetaPrefix((rest || '').trim())
  if (!raw) return null
  // 爽型（场面）由 matchShuangTypeAsChapterTitle 处理，此处不重复
  if (matchShuangTypeAsChapterTitle(raw)) return null
  const m = raw.match(/^(.+?)\s*[（(](.+?)[）)]\s*$/)
  if (!m) return null
  const main = m[1].trim()
  const note = m[2].trim()
  if (!main || !note || [...main].length < 2) return null
  let kind: TitleParenAnnotation['kind'] = 'other'
  if (TITLE_NOTE_TIME_RE.test(note)) kind = 'time'
  else if (TITLE_NOTE_PLACE_RE.test(note) && [...note].length <= 14) kind = 'place'
  return { main, note, kind }
}

/** 「短标题 — 说明」仅取破折号前（说明不是标题字段） */
const CHAPTER_TITLE_DASH_SPLIT_RE = /[\/／|｜]|[—－–]{1,2}|\s+-\s+/

function normalizeChapterTitleRestHead(rest: string): string {
  let head = (rest || '').trim().split(CHAPTER_TITLE_DASH_SPLIT_RE)[0].trim()
  head = head.replace(/^[：:\-\s—－–]+/, '').trim()
  return head
}

function stripChapterTitleMetaPrefix(head: string): string {
  let s = head
  for (let i = 0; i < 3; i++) {
    const next = s.replace(
      /^(?:内容|概要|摘要|标题|章名|本章(?:内容|概要)?)\s*[：:]\s*/,
      '',
    )
    if (next === s) break
    s = next.trim()
  }
  return s
}

function clipTitleChars(text: string): string {
  const chars = [...text]
  if (chars.length <= CHAPTER_TITLE_MAX_CHARS) return text
  return chars.slice(0, CHAPTER_TITLE_MAX_CHARS).join('')
}

function isBareShortTitleOk(head: string): boolean {
  const t = (head || '').trim()
  if (!t) return false
  if (/[（(]/.test(t)) return false
  if (/[—－–]|\s-\s/.test(t)) return false
  if (/^(?:内容|概要|摘要|本章内容|本章概要)\s*[：:]/.test(t)) return false
  if ([...t].length > CHAPTER_TITLE_MAX_CHARS) return false
  if (matchShuangTypeAsChapterTitle(t)) return false
  return [...t].length >= 2
}

/** 大纲「第N章：」后原文是否违反短标题合同；返回原因或 null */
export function reasonIfInvalidChapterTitleRest(rest: string): string | null {
  const rawHead = (rest || '').trim()
  if (matchShuangTypeAsChapterTitle(rawHead)) {
    return '把【爽型】闭集词当成了章标题（应写在【爽型】行）'
  }
  const parenAnn = matchTitleParenAnnotation(rawHead)
  if (parenAnn) {
    if (parenAnn.kind === 'time') {
      return '标题括号夹注了时间（应写在【本章时间】）'
    }
    if (parenAnn.kind === 'place') {
      return '标题括号夹注了地点（应写在【本章地点】）'
    }
    return '标题含括号夹注（说明应写入标签块，勿粘在标题后）'
  }
  const slashFirst = rawHead.split(/[\/／|｜]/)[0].trim()
  if (/[—－–]|\s-\s/.test(slashFirst)) {
    return '含破折号副标题（说明应写入标签块）'
  }
  const head = stripChapterTitleMetaPrefix(normalizeChapterTitleRestHead(rawHead))
  if (!head) return '缺短标题'
  if (/^(?:内容|概要|摘要|本章内容|本章概要)\s*[：:]/.test(head)) {
    return '写成了「内容/概要：…」'
  }
  if ([...head].length > CHAPTER_TITLE_MAX_CHARS) {
    return `超过${CHAPTER_TITLE_MAX_CHARS}字`
  }
  return null
}

/**
 * 从不合规标题位压成短标题。
 * - 爽型（场面）→ 用场面名
 * - 场面（时间/地点夹注）→ 用括号外主标题，夹注归标签
 */
export function deriveShortChapterTitle(rest: string, chapterNumber: number): string {
  const shuangHit = matchShuangTypeAsChapterTitle(rest)
  if (shuangHit?.sceneHint) {
    const fromScene = clipTitleChars(
      (shuangHit.sceneHint.split(/[，,。；;！!？?]/)[0] || '').trim(),
    )
    if (fromScene && isBareShortTitleOk(fromScene)) return fromScene
  }

  const parenAnn = matchTitleParenAnnotation(rest)
  if (parenAnn) {
    const main = clipTitleChars(
      (parenAnn.main.split(/[，,。；;！!？?]/)[0] || '').trim(),
    )
    if (main && isBareShortTitleOk(main)) return main
  }

  let head = stripChapterTitleMetaPrefix(normalizeChapterTitleRestHead(rest))
  if (shuangHit && head === shuangHit.shuang) {
    return `第${chapterNumber}章`
  }
  if (!head) return `第${chapterNumber}章`
  const clause = (head.split(/[，,。；;！!？?（(]/)[0] || '').trim()
  if (clause && [...clause].length >= 2) head = clause
  head = clipTitleChars(head)
  if (!head || !isBareShortTitleOk(head)) return `第${chapterNumber}章`
  return head
}

function peekChapterTagValue(lines: string[], fromIndex: number, tag: string): string {
  const re = new RegExp(`^【${tag}】\\s*(.+)$`)
  for (let i = fromIndex + 1; i < Math.min(fromIndex + 48, lines.length); i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (CHAPTER_HEADER_RE.test(t)) break
    const m = t.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

function chapterBlockHasTag(lines: string[], fromIndex: number, tag: string): boolean {
  const re = new RegExp(`^【${tag}】`)
  for (let i = fromIndex + 1; i < Math.min(fromIndex + 48, lines.length); i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (CHAPTER_HEADER_RE.test(t)) break
    if (re.test(t)) return true
  }
  return false
}

export type OutlineChapterTitlesResult = {
  ok: boolean
  reasons: string[]
  badChapters: number[]
}

function chapterSummarySectionBounds(fullOutline: string): { start: number; body: string } | null {
  const m = fullOutline.match(/【?\s*分章概要\s*】?[\s:：]*\n?/i)
    || fullOutline.match(/(?:^|\n)\s*#{1,3}\s*分章概要\s*\n/im)
  if (!m || m.index === undefined) return null
  const start = m.index + m[0].length
  return { start, body: fullOutline.slice(start) }
}

/**
 * 源头改写：纠正字段串用（爽型/时间/地点粘进标题位）；
 * 标题只留场面短名，夹注归还对应标签行。
 */
export function normalizeOutlineChapterTitles(fullOutline: string): string {
  if (!fullOutline?.trim()) return fullOutline || ''

  const bounds = chapterSummarySectionBounds(fullOutline)
  const rewriteBody = (body: string): string => {
    const lines = body.split('\n')
    const out: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      const m = trimmed.match(CHAPTER_HEADER_RE)
      if (!m) {
        out.push(line)
        continue
      }
      const num = parseChapterNumber(m)
      if (num === null) {
        out.push(line)
        continue
      }
      const rest = m[3] || ''
      if (!reasonIfInvalidChapterTitleRest(rest)) {
        out.push(line)
        continue
      }

      const shuangHit = matchShuangTypeAsChapterTitle(rest)
      const parenAnn = matchTitleParenAnnotation(rest)
      let short = deriveShortChapterTitle(rest, num)
      if (shuangHit && (short === `第${num}章` || matchShuangTypeAsChapterTitle(short))) {
        const catalyst = peekChapterTagValue(lines, i, '本章起因')
        if (catalyst) {
          const fromCatalyst = deriveShortChapterTitle(catalyst, num)
          if (fromCatalyst && fromCatalyst !== `第${num}章` && isBareShortTitleOk(fromCatalyst)) {
            short = fromCatalyst
          }
        }
      }

      out.push(`第${num}章：${short}`)
      if (shuangHit && !chapterBlockHasTag(lines, i, '爽型')) {
        out.push(`【爽型】${shuangHit.shuang}`)
      }
      // 标题括号里的时间/地点：归还标签（块内尚无时）
      if (parenAnn?.kind === 'time' && !chapterBlockHasTag(lines, i, '本章时间')) {
        out.push(`【本章时间】${parenAnn.note}`)
      } else if (parenAnn?.kind === 'place' && !chapterBlockHasTag(lines, i, '本章地点')) {
        out.push(`【本章地点】${parenAnn.note}`)
      } else if (
        !shuangHit
        && !parenAnn
      ) {
        const cleaned = stripChapterTitleMetaPrefix(normalizeChapterTitleRestHead(rest))
        if (cleaned && cleaned !== short && [...cleaned].length > [...short].length) {
          out.push(cleaned)
        }
      }
    }
    return out.join('\n')
  }

  if (bounds) {
    return fullOutline.slice(0, bounds.start) + rewriteBody(bounds.body)
  }
  return rewriteBody(fullOutline)
}

/**
 * 生成/落库前硬闸：分章行「第N章：」后必须是短标题（按章号去重）。
 */
export function assertOutlineChapterTitles(fullOutline: string): OutlineChapterTitlesResult {
  const seen = new Set<number>()
  const badChapters: number[] = []
  const reasons: string[] = []
  if (!fullOutline?.trim()) return { ok: true, reasons, badChapters }

  const bounds = chapterSummarySectionBounds(fullOutline)
  const section = bounds?.body ?? fullOutline

  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(CHAPTER_HEADER_RE)
    if (!m) continue
    const num = parseChapterNumber(m)
    if (num === null || seen.has(num)) continue
    seen.add(num)
    const reason = reasonIfInvalidChapterTitleRest(m[3] || '')
    if (!reason) continue
    badChapters.push(num)
    if (reasons.length < 8) {
      reasons.push(`第${num}章标题不合规（${reason}）`)
    }
  }
  return { ok: badChapters.length === 0, reasons, badChapters }
}

/** 从分章行首段提取章节标题（如「坠崖奇遇 / 林萧…」→「坠崖奇遇」） */
export function extractChapterTitleFromRest(rest: string): string {
  if (!rest?.trim()) return ''
  // 与 derive 同源：先拆字段串用，再取短标题
  const derived = deriveShortChapterTitle(rest, 0)
  if (derived && derived !== '第0章') return derived
  const head = stripChapterTitleMetaPrefix(normalizeChapterTitleRestHead(rest))
  if (!head) return ''
  const main = (head.split(/[（(]/)[0] || '').trim()
  if (!main) return ''
  if ([...main].length > CHAPTER_TITLE_MAX_CHARS) {
    return `${[...main].slice(0, CHAPTER_TITLE_MAX_CHARS).join('')}…`
  }
  return main
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

/** 章节列表展示：全书大纲分章标题优先（大纲重生成后列表即时对齐） */
export function resolveChapterListDisplayTitle(args: {
  episodeTitle: string | null | undefined
  chapterNumber: number
  bookOutline?: string | null
}): string {
  const { episodeTitle, chapterNumber, bookOutline } = args
  const parsed = bookOutline ? extractChapterTitle(bookOutline, chapterNumber) : ''
  if (parsed) return parsed
  const stored = (episodeTitle || '').trim()
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

export function listMissingOutlineChapters(
  fullOutline: string,
  totalChapters: number,
): number[] {
  return listMissingOutlineChaptersInRange(fullOutline, 1, totalChapters)
}

/** 检查 [from, to] 闭区间内缺哪些章号 */
export function listMissingOutlineChaptersInRange(
  fullOutline: string,
  fromChapter: number,
  toChapter: number,
): number[] {
  const map = parseChapterOutlines(fullOutline)
  const missing: number[] = []
  const from = Math.max(1, fromChapter)
  const to = Math.max(from, toChapter)
  for (let n = from; n <= to; n++) {
    if (!map.has(n)) missing.push(n)
  }
  return missing
}

/**
 * 全书大纲单次生成上限：每章完整戏剧标签块约 800～1200 token，
 * 叠加世界观/总纲/分卷后，16k 输出常在第 12 章附近截断。
 * 超过此章数必须走「骨架 + 分卷分批」，不能单次生成。
 */
export const OUTLINE_SINGLE_SHOT_MAX_CHAPTERS = 12

export function shouldUsePhasedOutlineGeneration(totalChapters: number): boolean {
  return totalChapters > OUTLINE_SINGLE_SHOT_MAX_CHAPTERS
}

export function validateOutlineChapterCoverage(
  fullOutline: string,
  totalChapters: number,
): { ok: boolean; maxChapter: number; missing: number; missingChapters: number[] } {
  const maxChapter = getMaxParsedChapterNumber(fullOutline)
  const missingChapters = listMissingOutlineChapters(fullOutline, totalChapters)
  return {
    ok: missingChapters.length === 0 && maxChapter >= totalChapters,
    maxChapter,
    missing: missingChapters.length,
    missingChapters,
  }
}
