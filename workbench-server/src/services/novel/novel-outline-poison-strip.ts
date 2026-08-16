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
  isAbstractStanceBeat,
  isSuspenseHookBeat,
  type OutlineBeatItem,
} from './novel-chapter-seam.js'
import {
  filterSubstantiveOutlineBeats,
  outlineBeatCoveredIn,
  outlineCatalystCoveredIn,
} from './novel-outline-beat-cover.js'
import {
  extractOutlineEmotionBeatTexts,
  outlineHasExplicitEmotionBeats,
} from './novel-outline-drama-fields.js'

const KEEP_DRAMA_TAGS = new Set(['本章起因', '阻碍', '局面变化', '人物选择'])
const KEEP_EMOTION_TAGS = ['恨', '爽', '急', '盼'] as const

/** 删毒砍掉大半长稿时作废（交大纲修写，禁止留下 60 字碎片却标通过） */
const CATASTROPHIC_STRIP_RATIO = 0.65
const CATASTROPHIC_MIN_SRC = 800

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
  let found = -1
  for (let end = Math.min(80, chars.length); end <= chars.length; end += step) {
    if (beatCovered(joinChars(chars, 0, end), item)) {
      found = end
      break
    }
  }
  if (found < 0) {
    if (beatCovered(content, item)) return chars.length
    return -1
  }
  // 粗步进会越过真·首盖点并吞进下一句毒尾；二分收回到最小仍覆盖的前缀
  let lo = Math.max(0, found - step)
  let hi = found
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (beatCovered(joinChars(chars, 0, mid), item)) hi = mid
    else lo = mid + 1
  }
  return hi
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
  // 已落在句读之后：禁止再向前吞下一句（否则会把末拍后的越界毒尾一并留下）
  if (offset > 0 && /[。！？\n]/.test(chars[offset - 1]!)) return offset
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

  // 显式恨爽急盼：保留四拍，硬止【盼】——禁止用局面变化截掉急/盼
  if (outlineHasExplicitEmotionBeats(outline)) {
    const emo = extractOutlineEmotionBeatTexts(outline)
    const keepItems: KeepBeat[] = KEEP_EMOTION_TAGS
      .map((tag, index) => {
        const beat = tag === '恨' ? emo.hate
          : tag === '爽' ? emo.shuang
            : tag === '急' ? emo.ji
              : emo.pan
        return { beat, tag, index }
      })
      .filter(b => charLen(b.beat) >= 4)
    const actionBeat = boundary.actionBeat || emo.pan || emo.ji || ''
    if (actionBeat && !keepItems.some(b => b.beat === actionBeat)) {
      keepItems.push({ beat: actionBeat, tag: '盼', index: keepItems.length })
    }
    return {
      keepBeats: keepItems.map(b => b.beat),
      keepItems: keepItems.map((b, index) => ({ ...b, index })),
      actionBeat,
    }
  }

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

  // 末拍硬止：用边界行动拍，但抽象态度句不作截断锚
  let actionBeat = boundary.actionBeat || boundary.lastBeat || ''
  if (actionBeat && isAbstractStanceBeat(actionBeat)) {
    const fallback = keepItems
      .filter(b => b.tag === '局面变化' || (b.tag === '本章起因') || (b.tag !== '人物选择' && !isAbstractStanceBeat(b.beat)))
      .map(b => b.beat)
      .pop()
    actionBeat = fallback || ''
  }
  if (actionBeat && !keepItems.some(b => b.beat === actionBeat) && !isAbstractStanceBeat(actionBeat)) {
    keepItems = [...keepItems, { beat: actionBeat, tag: '局面变化', index: keepItems.length }]
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
 * 按大纲删毒：
 * - 末行动拍已覆盖时：保留章首～末拍（只砍越界毒尾），抽象态度拍不参与起点锚定
 * - 无任何保留拍可对齐时：保留原文（禁止清空成长稿→0 字，避免修写级联）
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

  // 恨爽急盼成稿：急/盼在【局面变化】/爽场本事词之后是合法正文；
  // 「首次覆盖末拍再砍尾」会把盼段误杀（盼文案常与爽场修机等共词）。真越界由下章泄漏等规则把关。
  if (outlineHasExplicitEmotionBeats(outline)) {
    const keepCount = content.split(/[。！？\n]+/).filter(s => charLen(s.trim()) >= 6).length
    return {
      text: content,
      changed: false,
      keepCount,
      discardCount: 0,
      removedChars: 0,
      keepBeats,
      actionBeat,
    }
  }

  const chars = charsOf(content)
  const total = chars.length
  const useActionEnd = !!(actionBeat && !isAbstractStanceBeat(actionBeat))
  const actionItem = useActionEnd
    ? (keepItems.find(b => b.beat === actionBeat) || { beat: actionBeat, tag: '局面变化', index: 99 })
    : null
  let actionOff = actionItem ? firstCoverOffset(content, actionItem as KeepBeat) : -1

  const covers = keepItems
    .map(item => ({ item, off: firstCoverOffset(content, item) }))
    .filter(x => x.off >= 0)

  // 仅末拍可对齐时，仍按末拍砍尾（不要因其它 keep 未命中而清空）
  if (!covers.length && actionOff < 0 && actionItem) {
    actionOff = firstCoverOffset(content, actionItem as KeepBeat)
  }
  if (!covers.length && actionOff < 0) {
    // 整章对不齐：保留原文，交后续大纲修写（禁止 strip-all → chars=0）
    return {
      text: content,
      changed: false,
      keepCount: content.split(/[。！？\n]+/).filter(s => charLen(s.trim()) >= 6).length,
      discardCount: 0,
      removedChars: 0,
      keepBeats,
      actionBeat,
    }
  }

  // 起点：有末拍时默认章首前缀保留；仅当明确头毒（非抽象拍很晚才出现）才裁前缀
  const substantiveStarts = covers.filter(
    c => !isAbstractStanceBeat(c.item.beat) && c.item.tag !== '人物选择',
  )
  const startAnchorOff = substantiveStarts.length
    ? Math.min(...substantiveStarts.map(c => c.off))
    : (covers.length ? Math.min(...covers.map(c => c.off)) : 0)

  let start = 0
  if (actionOff >= 0) {
    // 末拍硬止：只砍毒尾。头毒仅在「非抽象拍」明显偏后且仍早于末拍时裁掉
    if (startAnchorOff > 120 && startAnchorOff < actionOff * 0.55) {
      start = snapStartToSentence(chars, Math.max(0, startAnchorOff - 40))
    }
  } else {
    start = snapStartToSentence(chars, Math.max(0, startAnchorOff - 40))
  }

  const endRaw = actionOff >= 0
    ? actionOff
    : Math.max(...covers.map(c => c.off))
  let end = snapEndToSentence(chars, endRaw)
  if (actionOff >= 0) {
    end = Math.min(end, snapEndToSentence(chars, actionOff))
  }

  if (end <= start) {
    // 末拍可对齐时回退为「章首～末拍」，避免抽象短窗把跨度挤没
    if (actionOff >= 0) {
      start = 0
      end = Math.min(total, snapEndToSentence(chars, actionOff))
    } else {
      start = Math.max(0, endRaw - 80)
      end = Math.min(total, endRaw + 20)
    }
  }

  const text = joinChars(chars, start, end).trim()
  const removedChars = Math.max(0, total - charLen(text))
  const prefixTrimOk = actionOff >= 0 && start <= Math.max(40, Math.floor(Math.max(actionOff, 1) * 0.15))
  const clearTailCut = actionOff >= 0 && (total - end) > 80

  // 长稿被砍掉大半：仅在「误砍成碎片/错窗」时回退。
  // 末拍前缀截尾（明确越界毒尾）即使删≥65%也保留——否则会把 65% 越界稿原样交硬拒。
  if (
    total >= CATASTROPHIC_MIN_SRC
    && removedChars / total >= CATASTROPHIC_STRIP_RATIO
    && !(prefixTrimOk && clearTailCut)
  ) {
    return {
      text: content,
      changed: false,
      keepCount: content.split(/[。！？\n]+/).filter(s => charLen(s.trim()) >= 6).length,
      discardCount: 0,
      removedChars: 0,
      keepBeats,
      actionBeat,
    }
  }

  const headPoison = start > 40
  const tailPoison = total - end > 80
  const changed = (headPoison || tailPoison || removedChars >= 80) && charLen(text) > 0

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
