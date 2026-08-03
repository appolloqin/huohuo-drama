/**
 * 大纲拍点数驱动本章有效目标字数（题材无关）。
 * 用户目标为上限；拍点少时下调，避免短大纲被高字数逼出越界。
 */
import { extractOutlineBeatPhrases } from './novel-chapter-seam.js'

const DEFAULT_CHARS_PER_BEAT = 500
const MIN_FLOOR = 800

function substantiveBeats(beats: string[]): string[] {
  return beats.filter(b => [...b].length >= 6)
}

export type EffectiveChapterTarget = {
  beatCount: number
  userTarget: number
  effectiveTarget: number
  downscaled: boolean
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
  const floor = args.minFloor ?? MIN_FLOOR
  const beatCount = substantiveBeats(extractOutlineBeatPhrases(args.chapterOutline || '')).length
  const effectiveTarget = beatCount <= 0
    ? userTarget
    : Math.min(userTarget, Math.max(floor, beatCount * per))
  const downscaled = effectiveTarget < userTarget
  const promptBlock = downscaled
    ? `【篇幅（大纲驱动）】本章大纲约 ${beatCount} 个有效拍点；有效目标 ≤ ${effectiveTarget} 字（用户目标 ${userTarget}）。宁可略短悬停末拍；禁止用大纲未列情节凑字。`
    : `【篇幅】目标约 ${effectiveTarget} 字；只加厚本章大纲已列拍点。`
  return { beatCount, userTarget, effectiveTarget, downscaled, promptBlock }
}
