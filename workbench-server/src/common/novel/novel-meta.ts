/** 小说项目 metadata 读写（存于 dramas.metadata JSON） */

import {
  normalizeGlobalContinuityState,
  type NovelGlobalContinuityState,
} from './novel-continuity-state.js'
import { parseJsonColumnObject, type JsonColumnInput } from '../db/parse-json-column.js'

export type NovelMetadata = {
  outline?: string
  premise?: string
  novel_genre?: string
  /** 续写时参考的上下文字符数，默认 4000 */
  context_chars?: number
  /** 一次生成本章的目标字数，默认 3000 */
  target_chapter_chars?: number
  /** 单次 AI 续写段落目标字数，默认 800 */
  continue_segment_chars?: number
  /** 全书当前一致性状态（截至 as_of_chapter 章末） */
  continuity_state?: NovelGlobalContinuityState
  /** 生成后一致性审校未通过时循环重写直至通过，默认 true */
  continuity_strict?: boolean
  /** 严格模式下单章最大修正轮次；0 表示不限制；未配置时默认 30 */
  continuity_rewrite_max?: number
  /** 一致性审校最低通过分数，默认 78 */
  continuity_min_score?: number
  /** 批量撰写是否先生成写作说明（brief）再写正文，对齐短剧 raw→rewrite 两阶段，默认 true */
  batch_two_phase?: boolean
  /** 某一章生成/审校失败时是否停止后续章节（连载建议开启），默认 true */
  batch_stop_on_error?: boolean
  /** 启用三层长记忆（world_bible / character_sheets / plot_ledger），默认 true */
  long_memory_enabled?: boolean
  /** 启用一行锚点 + 回声规则（anchor.txt），默认 true */
  anchor_echo_enabled?: boolean
  /** 因果链驱动（causal_chain.md + 变更记录审校），默认 true；false 时回退状态冻结硬审 */
  causal_chain_enabled?: boolean
}

export function parseNovelMetadata(raw: JsonColumnInput): NovelMetadata {
  const parsed = parseJsonColumnObject(raw)
  if (!Object.keys(parsed).length) return {}
  try {
    const continuity_state = normalizeGlobalContinuityState(parsed.continuity_state) ?? undefined
    return {
      outline: typeof parsed.outline === 'string' ? parsed.outline : undefined,
      premise: typeof parsed.premise === 'string' ? parsed.premise : undefined,
      novel_genre: typeof parsed.novel_genre === 'string' ? parsed.novel_genre : undefined,
      context_chars: Number.isFinite(Number(parsed.context_chars)) ? Number(parsed.context_chars) : undefined,
      target_chapter_chars: Number.isFinite(Number(parsed.target_chapter_chars))
        ? Number(parsed.target_chapter_chars) : undefined,
      continue_segment_chars: Number.isFinite(Number(parsed.continue_segment_chars))
        ? Number(parsed.continue_segment_chars) : undefined,
      continuity_state,
      continuity_strict: parsed.continuity_strict === false ? false : undefined,
      continuity_rewrite_max: (() => {
        const n = Number(parsed.continuity_rewrite_max)
        if (!Number.isFinite(n)) return undefined
        if (n === 0) return 0
        if (n >= 1) return Math.min(999, Math.round(n))
        return undefined
      })(),
      batch_two_phase: parsed.batch_two_phase === false ? false : undefined,
      batch_stop_on_error: parsed.batch_stop_on_error === false ? false : undefined,
      continuity_min_score: (() => {
        const n = Number(parsed.continuity_min_score)
        if (!Number.isFinite(n)) return undefined
        return Math.min(95, Math.max(60, Math.round(n)))
      })(),
      long_memory_enabled: parsed.long_memory_enabled === false ? false : undefined,
      anchor_echo_enabled: parsed.anchor_echo_enabled === false ? false : undefined,
      causal_chain_enabled: parsed.causal_chain_enabled === false ? false : undefined,
    }
  } catch {
    return {}
  }
}

export function mergeNovelMetadata(
  raw: JsonColumnInput,
  patch: Partial<NovelMetadata>,
): string {
  const base = parseNovelMetadata(raw)
  const next: NovelMetadata = { ...base, ...patch }
  if (patch.outline === '') delete next.outline
  if (patch.premise === '') delete next.premise
  return JSON.stringify(next)
}

export function isNovelProject(drama: { projectType?: string | null; project_type?: string | null }) {
  const t = drama.projectType || drama.project_type || 'drama'
  return t === 'novel'
}

const DEFAULT_CONTINUITY_REWRITE_MAX = 30
const DEFAULT_CONTINUITY_STAGNANT_STREAK = 5

/** @returns null 表示不限制修正次数（meta.continuity_rewrite_max = 0） */
export function resolveContinuityRewriteMax(meta: NovelMetadata, override?: number): number | null {
  if (override === 0) return null
  if (Number.isFinite(override) && override! >= 1) return Math.min(999, Math.round(override!))
  const fromMeta = meta.continuity_rewrite_max
  if (fromMeta === 0) return null
  if (Number.isFinite(fromMeta) && fromMeta! >= 1) return Math.min(999, Math.round(fromMeta!))
  return DEFAULT_CONTINUITY_REWRITE_MAX
}

/** 连续若干轮修正后正文 hash 完全不变则终止（默认 5，非「同一错误文案 3 轮」） */
export function resolveContinuityStagnantStreak(meta: NovelMetadata, override?: number): number {
  if (Number.isFinite(override) && override! >= 1) return Math.min(20, Math.round(override!))
  const fromMeta = (meta as { continuity_stagnant_streak?: number }).continuity_stagnant_streak
  if (Number.isFinite(fromMeta) && fromMeta! >= 1) return Math.min(20, Math.round(fromMeta!))
  return DEFAULT_CONTINUITY_STAGNANT_STREAK
}

const DEFAULT_CONTINUITY_MIN_SCORE = 78

export function resolveContinuityMinScore(meta: NovelMetadata, override?: number): number {
  if (Number.isFinite(override)) return Math.min(95, Math.max(60, Math.round(override!)))
  const fromMeta = meta.continuity_min_score
  if (Number.isFinite(fromMeta)) return Math.min(95, Math.max(60, Math.round(fromMeta!)))
  return DEFAULT_CONTINUITY_MIN_SCORE
}
