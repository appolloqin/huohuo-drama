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
  /** 章节质量评分落库，默认 true */
  chapter_craft_score_enabled?: boolean
  /** 字数软约束（按章职调节），默认 true */
  chapter_craft_length_soft?: boolean
  /** 质量未达标时循环修正/停批量，默认 true */
  chapter_craft_strict?: boolean
  /** 质量审校最低分，默认 70 */
  chapter_craft_min_score?: number
  /** 四件事至少 2 项，默认 true */
  chapter_craft_require_two_functions?: boolean
  /** 合规一票否决停章，默认 true */
  compliance_veto_enabled?: boolean
  /** 质量修正最大轮次，默认 3 */
  chapter_craft_rewrite_max?: number
  /** 写正文前校验大纲戏剧标签，默认 true */
  outline_drama_gate_enabled?: boolean
  /** 按大纲拍点顺序多次生成再拼接（P1），默认 true */
  beat_sequential_generate?: boolean
  /** 生成后自动去 AI 味闭环，默认 true */
  ai_humanize_auto?: boolean
  /** 自动去 AI 味最大精修轮次；0=只检测不改写；默认 3 */
  ai_humanize_max?: number
  /** 自动去 AI 味过关概率（含），默认 39 */
  ai_humanize_target?: number
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
      chapter_craft_score_enabled: parsed.chapter_craft_score_enabled === false ? false : undefined,
      chapter_craft_length_soft: parsed.chapter_craft_length_soft === false ? false : undefined,
      chapter_craft_strict: parsed.chapter_craft_strict === false ? false : undefined,
      chapter_craft_min_score: (() => {
        const n = Number(parsed.chapter_craft_min_score)
        if (!Number.isFinite(n)) return undefined
        return Math.min(95, Math.max(50, Math.round(n)))
      })(),
      chapter_craft_require_two_functions:
        parsed.chapter_craft_require_two_functions === false ? false : undefined,
      compliance_veto_enabled: parsed.compliance_veto_enabled === false ? false : undefined,
      chapter_craft_rewrite_max: (() => {
        const n = Number(parsed.chapter_craft_rewrite_max)
        if (!Number.isFinite(n)) return undefined
        if (n <= 0) return 0
        return Math.min(20, Math.round(n))
      })(),
      outline_drama_gate_enabled: parsed.outline_drama_gate_enabled === false ? false : undefined,
      beat_sequential_generate: parsed.beat_sequential_generate === false ? false : undefined,
      ai_humanize_auto: parsed.ai_humanize_auto === false ? false : undefined,
      ai_humanize_max: (() => {
        const n = Number(parsed.ai_humanize_max)
        if (!Number.isFinite(n)) return undefined
        if (n <= 0) return 0
        return Math.min(10, Math.round(n))
      })(),
      ai_humanize_target: (() => {
        const n = Number(parsed.ai_humanize_target)
        if (!Number.isFinite(n)) return undefined
        return Math.min(60, Math.max(20, Math.round(n)))
      })(),
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

/** 交付默认开：仅显式 false 关闭 */
export function isChapterCraftScoreEnabled(meta: NovelMetadata): boolean {
  return meta.chapter_craft_score_enabled !== false
}

export function isChapterCraftLengthSoftEnabled(meta: NovelMetadata): boolean {
  return meta.chapter_craft_length_soft !== false
}

export function isChapterCraftStrictEnabled(meta: NovelMetadata): boolean {
  return meta.chapter_craft_strict !== false
}

export function isComplianceVetoEnabled(meta: NovelMetadata): boolean {
  return meta.compliance_veto_enabled !== false
}

const DEFAULT_CHAPTER_CRAFT_MIN_SCORE = 70

export function resolveChapterCraftMinScore(meta: NovelMetadata, override?: number): number {
  if (Number.isFinite(override)) return Math.min(95, Math.max(50, Math.round(override!)))
  const fromMeta = meta.chapter_craft_min_score
  if (Number.isFinite(fromMeta)) return Math.min(95, Math.max(50, Math.round(fromMeta!)))
  return DEFAULT_CHAPTER_CRAFT_MIN_SCORE
}

export function resolveChapterCraftRewriteMax(meta: NovelMetadata): number {
  const n = meta.chapter_craft_rewrite_max
  if (n === 0) return 0
  if (Number.isFinite(n) && n! >= 1) return Math.min(20, Math.round(n!))
  // 对照大纲戏剧要素修正：默认 3 次
  return 3
}

/** 写正文前大纲戏剧标签闸门，默认开 */
export function isOutlineDramaGateEnabled(meta: NovelMetadata): boolean {
  return meta.outline_drama_gate_enabled !== false
}

/** 按拍点顺序生成（P1），默认开 */
export function isBeatSequentialGenerateEnabled(meta: NovelMetadata): boolean {
  return meta.beat_sequential_generate !== false
}

/** 交付默认开：仅显式 false 关闭（关闭时不做自动检测） */
export function isAiHumanizeAutoEnabled(meta: NovelMetadata): boolean {
  return meta.ai_humanize_auto !== false
}

const DEFAULT_AI_HUMANIZE_MAX = 3

/** 0 = 只检测不改写 */
export function resolveAiHumanizeMax(meta: NovelMetadata): number {
  const n = meta.ai_humanize_max
  if (n === 0) return 0
  if (Number.isFinite(n) && n! >= 1) return Math.min(10, Math.round(n!))
  return DEFAULT_AI_HUMANIZE_MAX
}

const DEFAULT_AI_HUMANIZE_TARGET = 39

export function resolveAiHumanizeTarget(meta: NovelMetadata): number {
  const n = meta.ai_humanize_target
  if (Number.isFinite(n)) return Math.min(60, Math.max(20, Math.round(n!)))
  return DEFAULT_AI_HUMANIZE_TARGET
}
