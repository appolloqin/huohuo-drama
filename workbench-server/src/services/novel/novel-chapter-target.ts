/**
 * 大纲拍点 → 篇幅提示（题材无关）。
 * **不强制下调用户目标字数**（下调会导致半长稿、token 预算过紧、句中截断）。
 * 仅提示：拍点少时须在已列拍点内写厚，勿用大纲外情节凑字。
 */
import { extractOutlineBeatPhrases } from './novel-chapter-seam.js'

const DEFAULT_CHARS_PER_BEAT = 500

function substantiveBeats(beats: string[]): string[] {
  return beats.filter(b => [...b].length >= 6)
}

export type EffectiveChapterTarget = {
  beatCount: number
  userTarget: number
  /** 始终等于 userTarget；保留字段以兼容调用方 */
  effectiveTarget: number
  /** 恒为 false：不再静默砍半字数 */
  downscaled: boolean
  /** 拍点偏少时的软提示（不改 min/max） */
  sparseBeats: boolean
  promptBlock: string
}

export function resolveEffectiveChapterTarget(args: {
  chapterOutline?: string
  userTarget: number
  charsPerBeat?: number
  minFloor?: number
}): EffectiveChapterTarget {
  const userTarget = Math.min(20000, Math.max(500, Math.round(Number(args.userTarget)) || 3000))
  const per = args.charsPerBeat ?? DEFAULT_CHARS_PER_BEAT
  const beatCount = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline || '')).length
  const suggested = beatCount <= 0 ? userTarget : Math.max(800, beatCount * per)
  const sparseBeats = beatCount > 0 && suggested < userTarget
  const promptBlock = sparseBeats
    ? `【篇幅】目标 ${userTarget} 字（须尽量写满）；本章大纲约 ${beatCount} 个有效拍点，请只在已列拍点内加厚冲突与反应顶满字数，禁止用大纲未列情节凑字；章末悬停末拍。`
    : `【篇幅】目标约 ${userTarget} 字；只加厚本章大纲已列拍点。`
  return {
    beatCount,
    userTarget,
    effectiveTarget: userTarget,
    downscaled: false,
    sparseBeats,
    promptBlock,
  }
}
