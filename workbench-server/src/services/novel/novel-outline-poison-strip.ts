/**
 * 正文级大纲删毒（题材无关）：
 * - 按保留拍点的覆盖跨度截取正文（支持跨句意译）
 * - 行动末拍落实后的后文一律丢弃
 * - 「欲望」「章末问题」不作 keep 锚
 * - 开篇未进入任一保留拍的前缀毒段删除
 */
import {
  extractOutlineBeatItems,
  extractOutlineBoundaryLastBeat,
  isSuspenseHookBeat,
  type OutlineBeatItem,
} from './novel-chapter-seam.js'
import {
  filterSubstantiveOutlineBeats,
  outlineBeatCoveredIn,
  outlineCatalystCoveredIn,
} from './novel-outline-beat-cover.js'

const KEEP_DRAMA_TAGS = new Set(['本章起因', '阻碍', '局面变化', '人物选择'])

export type OutlinePoisonStripResult = {
  text: string
  changed: boolean
  keepCount: number
  discardCount: number
  removedChars: number
  keepBeats: string[]
  actionBeat: string
}

type KeepBeat = {
  beat: string
  tag?: string
  index: number
}

function charLen(s: string): number {
  return [...s].length
}

function charsOf(s: string): string[] {
  return [...s]
}

function joinChars(chars: string[], start: number, end: number): string {
  return chars.slice(Math.max(0, start), Math.min(chars.length, end)).join('')
}

function beatCovered(hay: string, item: KeepBeat): boolean {
  if (item.tag === '本章起因') return outlineCatalystCoveredIn(hay, item.beat)
  return outlineBeatCoveredIn(hay, item.beat)
}

/** 前缀首次覆盖该拍的字符偏移；未覆盖返回 -1 */
function firstCoverOffset(content: string, item: KeepBeat): number {
  const chars = charsOf(content)
  if (chars.length < 20) return beatCovered(content, item) ? chars.length : -1
  const step = Math.max(16, Math.floor(chars.length / 100))
  for (let end = Math.min(80, chars.length); end <= chars.length; end += step) {
    if (beatCovered(joinChars(chars, 0, end), item)) return end
  }
  if (beatCovered(content, item)) return chars.length
  return -1
}

function snapStartToSentence(chars: string[], offset: number): number {
  if (offset <= 0) return 0
  // 向前找句读后的起点；最多回退 120 字，避免吞回大段毒前缀
  const min = Math.max(0, offset - 120)
  for (let i = offset - 1; i >= min; i--) {
    if (/[。！？\n]/.test(chars[i]!)) return i + 1
  }
  return min === 0 ? 0 : offset
}

function snapEndToSentence(chars: string[], offset: number): number {
  if (offset >= chars.length) return chars.length
  const max = Math.min(chars.length, offset + 80)
  for (let i = offset; i < max; i++) {
    if (/[。！？]/.test(chars[i]!)) return i + 1
  }
  return offset
}

export function resolvePoisonStripKeepBeats(chapterOutline: string): {
  keepBeats: string[]
  keepItems: KeepBeat[]
  actionBeat: string
} {
  const outline = chapterOutline.trim()
  const boundary = extractOutlineBoundaryLastBeat(outline)
  const items = extractOutlineBeatItems(outline, 16)
  const tagged = items.filter((i): i is OutlineBeatItem & { tag: string } => !!i.tag)

  let keepItems: KeepBeat[]
  if (tagged.length >= 2) {
    keepItems = tagged
      .filter(i => KEEP_DRAMA_TAGS.has(i.tag) && !isSuspenseHookBeat(i.beat))
      .map((i, index) => ({ beat: i.beat, tag: i.tag, index }))
  } else {
    const beats = filterSubstantiveOutlineBeats(
      items.map(i => i.beat).filter(b => !isSuspenseHookBeat(b)),
    )
    keepItems = beats.map((beat, index) => ({ beat, index }))
  }

  const actionBeat = boundary.actionBeat || boundary.lastBeat || ''
  if (actionBeat && !keepItems.some(b => b.beat === actionBeat)) {
    keepItems = [...keepItems, { beat: actionBeat, tag: '人物选择', index: keepItems.length }]
  }

  keepItems = keepItems
    .filter(b => charLen(b.beat) >= 4)
    .map((b, index) => ({ ...b, index }))

  return {
    keepBeats: keepItems.map(b => b.beat),
    keepItems,
    actionBeat,
  }
}

/**
 * 按大纲删毒：保留「首个保留拍～末行动拍（或最晚保留拍）」跨度内正文。
 */
export function stripOutlinePoisonProse(args: {
  content: string
  chapterOutline?: string
}): OutlinePoisonStripResult {
  const content = args.content?.trim() || ''
  const outline = args.chapterOutline?.trim() || ''
  if (!content || !outline) {
    return {
      text: content,
      changed: false,
      keepCount: 0,
      discardCount: 0,
      removedChars: 0,
      keepBeats: [],
      actionBeat: '',
    }
  }

  const { keepBeats, keepItems, actionBeat } = resolvePoisonStripKeepBeats(outline)
  if (!keepItems.length) {
    return {
      text: content,
      changed: false,
      keepCount: 0,
      discardCount: 0,
      removedChars: 0,
      keepBeats,
      actionBeat,
    }
  }

  const chars = charsOf(content)
  const total = chars.length
  const covers = keepItems
    .map(item => ({ item, off: firstCoverOffset(content, item) }))
    .filter(x => x.off >= 0)

  if (!covers.length) {
    // 整章无保留拍可对齐 → 视为全毒，交修写从大纲重写（不回退原文）
    return {
      text: '',
      changed: true,
      keepCount: 0,
      discardCount: 1,
      removedChars: total,
      keepBeats,
      actionBeat,
    }
  }

  const startRaw = Math.min(...covers.map(c => c.off))
  // 覆盖偏移是「前缀首次够格」的 end；跨度起点取该端点往前一小段句界
  let start = snapStartToSentence(chars, Math.max(0, startRaw - 40))

  const actionItem = actionBeat
    ? keepItems.find(b => b.beat === actionBeat) || { beat: actionBeat, tag: '人物选择', index: 99 }
    : null
  const actionOff = actionItem ? firstCoverOffset(content, actionItem as KeepBeat) : -1
  const endRaw = actionOff >= 0
    ? actionOff
    : Math.max(...covers.map(c => c.off))
  let end = snapEndToSentence(chars, endRaw)

  // 末拍已覆盖时，禁止把末拍之后的长毒尾留着
  if (actionOff >= 0) {
    end = Math.min(end, snapEndToSentence(chars, actionOff))
  }

  if (end <= start) {
    start = Math.max(0, endRaw - 80)
    end = Math.min(total, endRaw + 20)
  }

  const text = joinChars(chars, start, end).trim()
  const removedChars = Math.max(0, total - charLen(text))
  const headPoison = start > 40
  const tailPoison = total - end > 80
  const changed = (headPoison || tailPoison || removedChars >= 80) && charLen(text) > 0

  // keepCount：跨度内句数近似
  const keepCount = text.split(/[。！？\n]+/).filter(s => charLen(s.trim()) >= 6).length
  const discardCount = Math.max(0, content.split(/[。！？\n]+/).filter(s => charLen(s.trim()) >= 6).length - keepCount)

  return {
    text: changed ? text : (removedChars > 0 && charLen(text) > 0 && text !== content ? text : content),
    changed: changed || (text !== content && removedChars >= 80),
    keepCount,
    discardCount,
    removedChars: text !== content ? removedChars : 0,
    keepBeats,
    actionBeat,
  }
}
