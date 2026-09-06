/**
 * 朱雀式分段：自然段切分 + 段级 AIGC band（启发式，非朱雀官方分）
 */
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import type { Genre } from '../../common/novel/novel-detect-calib.js'
import { detectAiText, type AiDetectionSignal } from './ai-text-detection.js'
import { extractRawFeatures } from './ai-detect-features.js'
import { fuseEvidence, segmentAigc, type RefLineInput, type FusionWeights } from './ai-detect-fusion.js'
import type { PercentileTable, StatSub } from './ai-detect-calibration.js'

/** 与 detectAiText 最小有效窗口对齐，避免 &lt;80 → 固定 50% 误标 suspected */
export const AI_DETECT_SEGMENT_MIN_CHARS = 80
export const AI_DETECT_SEGMENT_MAX_CHARS = 800
export const AI_DETECT_TOP_K_SEGMENTS = 3
export const AI_DETECT_WINDOW_CHARS = 2000

export type AiDetectBand = 'human' | 'suspected' | 'ai'

export type AiDetectSegment = {
  index: number
  char_start: number
  char_end: number
  /** 落库时可省略以控体积 */
  text?: string
  aigc: number
  band: AiDetectBand
  probability: number
  signals?: AiDetectionSignal[]
  perplexity?: number
}

export type AiDetectSamplingWindow = {
  label: 'head' | 'mid' | 'tail' | string
  char_start: number
  char_end: number
  perplexity?: number
  probability?: number
  /** 引擎窗记账（spec §5.8：失败静默修） */
  status?: 'scored' | 'failed' | 'uncalibrated' | 'skipped'
}

export function bandFromAigc(aigc: number): AiDetectBand {
  if (aigc >= 0.85) return 'ai'
  if (aigc >= 0.5) return 'suspected'
  return 'human'
}

function sliceByCharCount(text: string, start: number, end: number): string {
  return [...text].slice(start, end).join('')
}

/** 按 UTF-16 无关的「字」切窗；返回原文下标近似（用展开后映射） */
export function charWindows(
  text: string,
  windowChars: number = AI_DETECT_WINDOW_CHARS,
): AiDetectSamplingWindow[] {
  const chars = [...text]
  const n = chars.length
  if (n <= 0) return []
  if (n <= windowChars) {
    return [{ label: 'head', char_start: 0, char_end: n }]
  }
  const midStart = Math.max(0, Math.floor((n - windowChars) / 2))
  const tailStart = Math.max(0, n - windowChars)
  const raw: AiDetectSamplingWindow[] = [
    { label: 'head', char_start: 0, char_end: Math.min(windowChars, n) },
    { label: 'mid', char_start: midStart, char_end: Math.min(midStart + windowChars, n) },
    { label: 'tail', char_start: tailStart, char_end: n },
  ]
  // 去重高度重叠窗
  const out: AiDetectSamplingWindow[] = []
  for (const w of raw) {
    const dup = out.some((o) => Math.abs(o.char_start - w.char_start) < windowChars * 0.35)
    if (!dup) out.push(w)
  }
  return out
}

export function windowText(text: string, w: Pick<AiDetectSamplingWindow, 'char_start' | 'char_end'>): string {
  return sliceByCharCount(text, w.char_start, w.char_end)
}

type RawPara = { text: string; char_start: number; char_end: number }

function splitParagraphsWithOffsets(text: string): RawPara[] {
  const out: RawPara[] = []
  const re = /\n\s*\n/g
  let last = 0
  let m: RegExpExecArray | null
  const parts: Array<{ raw: string; start: number }> = []
  while ((m = re.exec(text)) !== null) {
    parts.push({ raw: text.slice(last, m.index), start: last })
    last = m.index + m[0].length
  }
  parts.push({ raw: text.slice(last), start: last })

  for (const p of parts) {
    const t = p.raw.trim()
    if (!t) continue
    const lead = p.raw.match(/^\s*/)?.[0].length ?? 0
    const start = p.start + lead
    const end = start + t.length
    out.push({ text: t, char_start: start, char_end: end })
  }
  if (!out.length && text.trim()) {
    const t = text.trim()
    const start = text.indexOf(t)
    out.push({ text: t, char_start: start >= 0 ? start : 0, char_end: (start >= 0 ? start : 0) + t.length })
  }
  return out
}

function splitLongSegment(p: RawPara): RawPara[] {
  if (countNovelChars(p.text) <= AI_DETECT_SEGMENT_MAX_CHARS) return [p]
  const chars = [...p.text]
  const chunks: RawPara[] = []
  let offset = 0
  while (offset < chars.length) {
    const end = Math.min(offset + AI_DETECT_SEGMENT_MAX_CHARS, chars.length)
    const slice = chars.slice(offset, end).join('')
    // 粗略：用原文中 slice 的首次出现；长段内用累计字偏移映射到 char_start
    const localStart = p.char_start + [...p.text].slice(0, offset).join('').length
    chunks.push({
      text: slice,
      char_start: localStart,
      char_end: localStart + slice.length,
    })
    offset = end
  }
  return chunks
}

function segmentContentChars(text: string): number {
  return countNovelChars((text || '').replace(/\s+/g, ''))
}

/** 自然段切分；内容字 &lt;80 合并；过长再切 */
export function segmentTextForAiDetect(text: string): Array<{
  index: number
  char_start: number
  char_end: number
  text: string
}> {
  const paras = splitParagraphsWithOffsets(text || '')
  const merged: RawPara[] = []
  let buf: RawPara | null = null
  const flush = () => {
    if (!buf) return
    for (const part of splitLongSegment(buf)) merged.push(part)
    buf = null
  }
  for (const p of paras) {
    if (!buf) {
      buf = { ...p }
      continue
    }
    if (segmentContentChars(buf.text) < AI_DETECT_SEGMENT_MIN_CHARS) {
      const gap = text.slice(buf.char_end, p.char_start)
      buf = {
        text: `${buf.text}${gap}${p.text}`,
        char_start: buf.char_start,
        char_end: p.char_end,
      }
    } else {
      flush()
      buf = { ...p }
    }
  }
  flush()
  if (merged.length >= 2 && segmentContentChars(merged[merged.length - 1]!.text) < AI_DETECT_SEGMENT_MIN_CHARS) {
    const last = merged.pop()!
    const prev = merged[merged.length - 1]!
    const gap = text.slice(prev.char_end, last.char_start)
    merged[merged.length - 1] = {
      text: `${prev.text}${gap}${last.text}`,
      char_start: prev.char_start,
      char_end: last.char_end,
    }
  }
  return merged.map((p, i) => ({
    index: i,
    char_start: p.char_start,
    char_end: p.char_end,
    text: p.text,
  }))
}

/** @deprecated 由 buildFusedSegments 取代 */
export function scoreSegmentStatistical(segmentText: string): {
  aigc: number
  probability: number
  band: AiDetectBand
  signals: AiDetectionSignal[]
} {
  const r = detectAiText(segmentText)
  const aigc = Math.min(1, Math.max(0, r.probability / 100))
  return {
    aigc,
    probability: r.probability,
    band: bandFromAigc(aigc),
    signals: r.signals.slice(0, 4),
  }
}

/** @deprecated 由 buildFusedSegments 取代 */
export function buildStatisticalSegments(text: string): AiDetectSegment[] {
  return segmentTextForAiDetect(text).map((s) => {
    const scored = scoreSegmentStatistical(s.text)
    return {
      index: s.index,
      char_start: s.char_start,
      char_end: s.char_end,
      text: s.text,
      aigc: Math.round(scored.aigc * 1000) / 1000,
      band: scored.band,
      probability: scored.probability,
      signals: scored.signals,
    }
  })
}

/** @deprecated 由 buildFusedSegments 取代 */
export function fuseSegmentAigc(statAigc: number, pplProbability: number): number {
  const p = Math.min(1, Math.max(0, pplProbability / 100))
  return Math.round((0.55 * p + 0.45 * statAigc) * 1000) / 1000
}

export function countHighBandSegments(segments: AiDetectSegment[] | undefined): number {
  if (!segments?.length) return 0
  return segments.filter((s) => s.band === 'suspected' || s.band === 'ai').length
}

export function meanSegmentAigc(segments: AiDetectSegment[] | undefined): number {
  if (!segments?.length) return 0
  return segments.reduce((a, s) => a + s.aigc, 0) / segments.length
}

export type SegmentFusionDeps = {
  genre: Genre
  table: PercentileTable
  weights: FusionWeights
  ref?: RefLineInput | null
  /** 段级局部参考分（engine 用 topK PPL 复检填充；返回 undefined 表示继承全局 ref） */
  localRefOf?: (seg: { index: number; char_start: number; char_end: number; text: string }) => RefLineInput | null | undefined
  sameFamily: boolean
  fpSim?: number | null
  perturbStab?: number | null
  statsSub?: StatSub
}
export function buildFusedSegments(text: string, deps: SegmentFusionDeps): AiDetectSegment[] {
  return segmentTextForAiDetect(text).map((seg) => {
    const local = deps.localRefOf?.(seg)
    const ref = local === undefined ? deps.ref ?? null : local
    const f = fuseEvidence({
      raws: extractRawFeatures(seg.text), genre: deps.genre, table: deps.table, weights: deps.weights,
      ref, sameFamily: deps.sameFamily, fpSim: deps.fpSim, perturbStab: deps.perturbStab, statsSub: deps.statsSub,
    })
    const aigc = segmentAigc(f)
    return {
      index: seg.index, char_start: seg.char_start, char_end: seg.char_end, text: seg.text,
      aigc, band: bandFromAigc(aigc), probability: f.probability,
      signals: [
        { key: 's1_stat', score: Math.round(f.s1 * 1000) / 1000 },
        { key: 's2_reference', score: f.s2 == null ? 0 : Math.round(f.s2 * 1000) / 1000 },
      ],
      perplexity: ref?.ppl,
    }
  })
}

/** 落库瘦身：去掉 text，只保留非 human 或截断 */
export function compactSegmentsForStorage(segments: AiDetectSegment[] | undefined): AiDetectSegment[] | undefined {
  if (!segments?.length) return undefined
  return segments
    .filter((s) => s.band !== 'human')
    .slice(0, 40)
    .map(({ text: _t, signals: _s, ...rest }) => rest)
}
