/**
 * 生成前旧稿裁定（题材无关）：按本章大纲拍点决定旧文可保留 / 须丢弃。
 * - 丢弃：冷开篇开篇骨架（不进提示，也不贴「禁止再写」摘录）
 * - 保留：命中本章大纲拍点的旧句 + 从保留句抽出的人名（重写应参考有价值内容）
 */
import {
  detectChapterSeamColdOpen,
  extractOutlineBeatPhrases,
} from './novel-chapter-seam.js'
import { outlineBeatCoveredIn } from './novel-outline-beat-cover.js'
import { logTaskWarn } from '../../common/task/task-logger.js'

export type DraftOutlineFilterResult = {
  /** 可带入生成的信息块（人名 + 与大纲相关的旧句） */
  promptBlock: string
  /** 是否丢弃了旧稿主导开篇结构（开篇骨架作废；中后段有价值句仍可保留） */
  discardedStructure: boolean
  keepCount: number
  discardCount: number
  names: string[]
  /** 仅供日志；不得进入生成提示 */
  discardExcerpts: string[]
}

function charLen(s: string): number {
  return [...s].length
}

function splitChunks(text: string): string[] {
  return text
    .split(/[。！？\n]+/)
    .map(s => s.trim())
    .filter(s => charLen(s) >= 8)
}

/** 过滤叙述碎片，避免「天没亮他」之类进人名栏 */
const NAME_NOISE =
  /没亮|醒了|衣服|锁门|门槛|棉袄|草屑|雪地|出去|回来|准备|叮嘱|目送|刚刚|已经|然后|因为/

function extractNameCandidates(text: string, max = 6): string[] {
  const re = /[\u4e00-\u9fff]{2,4}/g
  const counts = new Map<string, number>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const w = m[0]
    if (NAME_NOISE.test(w)) continue
    if (/^(但是|然后|因为|所以|已经|什么|这个|那个|自己|他们|我们|你们|一个|没有|不是|可以|还是|只是|只得|忽然|于是|外头|里面)$/.test(w)) {
      continue
    }
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()]
    .filter(([w, n]) => n >= 2 || charLen(w) >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, max)
}

function chunkCoversAnyBeat(chunk: string, beats: string[]): boolean {
  return beats.some(b => outlineBeatCoveredIn(chunk, b))
}

/**
 * 按大纲裁定旧稿。
 * 开篇骨架作废时：仍保留命中大纲拍点的旧句与其人名；绝不贴丢弃摘录。
 */
export function filterDraftByChapterOutline(args: {
  existingText: string
  chapterOutline?: string
  prevChapterTail?: string
  chapterNumber: number
  maxKeepChars?: number
}): DraftOutlineFilterResult {
  const full = args.existingText.trim()
  const outline = args.chapterOutline?.trim() || ''
  const beats = outline
    ? extractOutlineBeatPhrases(outline).filter(b => charLen(b) >= 4)
    : []
  const maxKeep = args.maxKeepChars ?? 600

  if (!full) {
    return {
      promptBlock: '',
      discardedStructure: false,
      keepCount: 0,
      discardCount: 0,
      names: [],
      discardExcerpts: [],
    }
  }

  if (!beats.length) {
    const names = extractNameCandidates(full)
    const promptBlock = [
      '【旧稿裁定 — 无可对齐大纲拍点】',
      names.length ? `可用人名/称谓：${names.join('、')}` : '',
      '勿把旧稿当章节结构模板；结构以上章结尾与本章大纲为准。',
    ].filter(Boolean).join('\n')
    return {
      promptBlock,
      discardedStructure: true,
      keepCount: 0,
      discardCount: 1,
      names,
      discardExcerpts: [],
    }
  }

  const cold = args.chapterNumber >= 2 && !!detectChapterSeamColdOpen({
    content: full,
    chapterNumber: args.chapterNumber,
    prevChapterTail: args.prevChapterTail,
    chapterOutline: outline,
  })

  const chunks = splitChunks(full)
  const keep: string[] = []
  const discard: string[] = []
  let keepBudget = 0
  let leadingOrphanChars = 0
  let seenFirstBeat = false

  for (const c of chunks) {
    const hit = chunkCoversAnyBeat(c, beats)
    if (!seenFirstBeat) {
      if (!hit) {
        leadingOrphanChars += charLen(c)
        discard.push(c.slice(0, 80) + (c.length > 80 ? '…' : ''))
        continue
      }
      seenFirstBeat = true
    }
    if (hit && keepBudget < maxKeep) {
      keep.push(c.slice(0, 100) + (c.length > 100 ? '…' : ''))
      keepBudget += charLen(c)
      continue
    }
    if (!hit) {
      discard.push(c.slice(0, 80) + (c.length > 80 ? '…' : ''))
    }
  }

  const leadingColdHead = leadingOrphanChars >= 80
  const discardedStructure = cold || leadingColdHead || (discard.length > 0 && keep.length === 0)
  // 人名只从「保留句」抽，避免离家开篇碎片进人名栏
  const names = keep.length
    ? extractNameCandidates(keep.join('。'))
    : []

  const lines = [
    discardedStructure
      ? '【旧稿裁定 — 开篇骨架已作废，保留大纲相关有价值内容】'
      : '【旧稿裁定 — 可参考信息】',
    names.length ? `可用人名/称谓：${names.join('、')}` : '',
    keep.length
      ? `与本章大纲拍点相关的旧句（须保留并写厚，勿照抄开篇骨架）：\n${keep.map(s => `  · ${s}`).join('\n')}`
      : discardedStructure
        ? '（旧稿中无可保留的大纲相关句；结构须从上章结尾 + 本章大纲从零写。）'
        : '（旧稿中无可保留的大纲相关句。）',
    discardedStructure
      ? '硬性：已作废的开篇骨架禁止写回；开篇承接【上章结尾】已发生事实之后；只展开【本章大纲】拍点。'
      : '结构硬性：开篇承接【上章结尾】已发生事实之后；只展开【本章大纲】拍点。',
  ]

  logTaskWarn('Novel', 'draft-outline-filter', {
    chapterNumber: args.chapterNumber,
    cold,
    leadingOrphanChars,
    leadingColdHead,
    keepCount: keep.length,
    discardCount: discard.length,
    discardedStructure,
    zeroDiscardExcerpt: true,
  })

  return {
    promptBlock: lines.filter(Boolean).join('\n'),
    discardedStructure,
    keepCount: keep.length,
    discardCount: discard.length,
    names,
    discardExcerpts: [],
  }
}

/** @deprecated 使用 buildOutlineOnlyWritingStub + extractBriefNonStructuralMeta */
export function formatStyleOnlyBriefBlock(alignedBrief: string): string {
  const t = alignedBrief.trim()
  if (!t) return ''
  return [
    '【写作说明 — 仅文风/人物/氛围参考】',
    '结构与开篇时空以上章结尾 + 本章大纲为准；本说明不得驱动开篇时空或章节骨架。',
    t.slice(0, 200),
  ].join('\n')
}
