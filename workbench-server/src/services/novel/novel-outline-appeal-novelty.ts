/**
 * 大纲新意合同：卖点偏转三标签 + allowlist 题材默认拼盘检测
 */
import { extractTagBlock } from './novel-outline-drama-fields.js'

/** 仅这些题材启用「重生+催债+修机」默认拼盘硬拦 */
export const NOVELTY_GENRE_ALLOWLIST_RE = /农文|种田|年代|重生|七零|八零|九零|穿越/

const NOVELTY_TAG_LABELS = ['卖点偏转', '非常规压力源', '能力非常规用法'] as const

function nonEmpty(s: string | null | undefined, min = 2): boolean {
  return !!s && [...s.trim()].length >= min
}

/** 总纲三标签非空硬校验（与 assertOutlineBookFields 并列） */
export function assertOutlineAppealNoveltyTags(outline: string): {
  ok: boolean
  missing: string[]
} {
  const missing: string[] = []
  for (const label of NOVELTY_TAG_LABELS) {
    if (!nonEmpty(extractTagBlock(outline || '', label))) missing.push(label)
  }
  return { ok: missing.length === 0, missing }
}

/**
 * allowlist 题材下：同时命中「重生/穿越 + 催债抵房 + 修机柴油」且【卖点偏转】未点第三条偏转轴 → 失败。
 * 非 allowlist 题材直接放行。
 */
export function detectDefaultFarmRebirthCliché(outline: string): string | null {
  const text = outline || ''
  if (!NOVELTY_GENRE_ALLOWLIST_RE.test(text)) return null
  const triad =
    /重生|穿越/.test(text)
    && /催债|抵房|让房|工分债/.test(text)
    && /柴油|修机|农机/.test(text)
  if (!triad) return null
  const bend = extractTagBlock(text, '卖点偏转') || ''
  // 偏转句须点出第三轴；仅有【卖点偏转】标签或空喊「不一样」不够
  if (/假账|掉包|派系|专利|配方|非叔|队里|会计造假/.test(bend)) return null
  return '默认拼盘（重生+催债抵房+修机）缺少第三条偏转轴'
}
