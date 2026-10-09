/** 小说项目 metadata 读写（存于 dramas.metadata JSON） */

import { parseJsonColumnObject, type JsonColumnInput } from '../db/parse-json-column.js'
import {
  normalizeGlobalContinuityState,
  type NovelGlobalContinuityState,
} from './novel-continuity-state.js'
import { resolveSkillKeyFromGenreValue } from './novel-genre-registry.js'
import {
  DEFAULT_HUMANIZE_TARGET,
  HUMANIZE_TARGET_MAX,
  HUMANIZE_TARGET_MIN,
} from './novel-detect-calib.js'

export type NovelMetadata = {
  outline?: string
  premise?: string
  novel_genre?: string
  /** 题材类型 ID，Skill 路由唯一依据（与 preset skillKey 对应） */
  novel_genre_skill_key?: string
  /** 辅题材 skillKey，最多 3；不改 Skill 路由 */
  novel_genre_secondary_keys?: string[]
  worldview_id?: string
  worldview_custom?: string
  /** @deprecated 兼容旧单选；读写时与 cultivation_ids[0] 同步 */
  cultivation_id?: string
  /** 修炼体系多选（目录 id），最多 8 */
  cultivation_ids?: string[]
  cultivation_custom?: string
  golden_finger_id?: string
  golden_finger_custom?: string
  /** 热榜套用来源（审计）；P0 可空 */
  hot_source?: { platform: string; externalId: string; title: string }
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
  /**
   * 偏好异模型困惑度检测（C2）。
   * true 时同系检测 warning 加前缀；不阻断、不改写作模型。默认 false。
   */
  prefer_cross_model_detect?: boolean
  /**
   * 章节审稿目标平台：fanqie | qidian | jinjiang | generic。
   * 默认 fanqie（番茄过审痛点最高）。
   */
  review_platform?: string
  /** 生成后自动跑平台审稿（建议级，不阻断落库），默认 true */
  chapter_review_auto?: boolean
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
      novel_genre_skill_key:
        typeof parsed.novel_genre_skill_key === 'string' ? parsed.novel_genre_skill_key : undefined,
      novel_genre_secondary_keys: parseSecondaryGenreKeys(parsed.novel_genre_secondary_keys),
      worldview_id: typeof parsed.worldview_id === 'string' ? parsed.worldview_id : undefined,
      worldview_custom: typeof parsed.worldview_custom === 'string' ? parsed.worldview_custom : undefined,
      ...parseCultivationFields(parsed),
      golden_finger_id: typeof parsed.golden_finger_id === 'string' ? parsed.golden_finger_id : undefined,
      golden_finger_custom:
        typeof parsed.golden_finger_custom === 'string' ? parsed.golden_finger_custom : undefined,
      hot_source: parseHotSource(parsed.hot_source),
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
      prefer_cross_model_detect: parsed.prefer_cross_model_detect === true ? true : undefined,
      review_platform: typeof parsed.review_platform === 'string' ? parsed.review_platform : undefined,
      chapter_review_auto: parsed.chapter_review_auto === false ? false : undefined,
    }
  } catch {
    return {}
  }
}

export type NovelMetadataPatch = Partial<NovelMetadata> & {
  /** null = 删除 hot_source */
  hot_source?: NovelMetadata['hot_source'] | null
}

function parseSecondaryGenreKeys(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const keys: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const k = item.trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    keys.push(k)
    if (keys.length >= 3) break
  }
  return keys
}

function parseHotSource(raw: unknown): NovelMetadata['hot_source'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const platform = typeof o.platform === 'string' ? o.platform.trim() : ''
  const externalId = typeof o.externalId === 'string' ? o.externalId.trim() : ''
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!platform || !externalId || !title) return undefined
  return { platform, externalId, title }
}

export function mergeNovelMetadata(
  raw: JsonColumnInput,
  patch: NovelMetadataPatch,
): string {
  const base = parseNovelMetadata(raw)
  const next: NovelMetadata = { ...base, ...patch } as NovelMetadata
  if (patch.outline === '') delete next.outline
  if (patch.premise === '') delete next.premise
  if (patch.novel_genre === '') delete next.novel_genre
  if (patch.novel_genre_skill_key === '') delete next.novel_genre_skill_key
  if (patch.worldview_id === '') delete next.worldview_id
  if (patch.worldview_custom === '') delete next.worldview_custom
  if (patch.cultivation_custom === '') delete next.cultivation_custom
  if (patch.golden_finger_id === '') delete next.golden_finger_id
  if (patch.golden_finger_custom === '') delete next.golden_finger_custom
  if (patch.hot_source === null) delete next.hot_source
  if (Array.isArray(patch.novel_genre_secondary_keys)) {
    next.novel_genre_secondary_keys = parseSecondaryGenreKeys(patch.novel_genre_secondary_keys) || []
  }
  if (Array.isArray(patch.cultivation_ids) || typeof patch.cultivation_id === 'string') {
    const synced = syncCultivationFields({
      cultivation_ids: Array.isArray(patch.cultivation_ids)
        ? patch.cultivation_ids
        : next.cultivation_ids,
      cultivation_id: typeof patch.cultivation_id === 'string' ? patch.cultivation_id : next.cultivation_id,
    })
    if (synced.cultivation_ids?.length) {
      next.cultivation_ids = synced.cultivation_ids
      next.cultivation_id = synced.cultivation_id
    } else {
      delete next.cultivation_ids
      delete next.cultivation_id
    }
  } else if (patch.cultivation_id === '') {
    delete next.cultivation_id
    delete next.cultivation_ids
  }
  return JSON.stringify(next)
}

const CULTIVATION_IDS_MAX = 8

function parseCultivationIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= CULTIVATION_IDS_MAX) break
  }
  return out
}

function syncCultivationFields(input: {
  cultivation_ids?: string[]
  cultivation_id?: string
}): { cultivation_ids?: string[]; cultivation_id?: string } {
  let ids = parseCultivationIdList(input.cultivation_ids)
  const legacy = (input.cultivation_id || '').trim()
  if (!ids.length && legacy) ids = [legacy]
  if (legacy && ids.length && !ids.includes(legacy)) {
    // 仅传了旧字段且与多选不一致时，以多选为准
  }
  if (!ids.length) return {}
  return { cultivation_ids: ids, cultivation_id: ids[0] }
}

function parseCultivationFields(parsed: Record<string, unknown>): {
  cultivation_id?: string
  cultivation_ids?: string[]
  cultivation_custom?: string
} {
  const synced = syncCultivationFields({
    cultivation_ids: parseCultivationIdList(parsed.cultivation_ids),
    cultivation_id: typeof parsed.cultivation_id === 'string' ? parsed.cultivation_id : undefined,
  })
  return {
    ...synced,
    cultivation_custom:
      typeof parsed.cultivation_custom === 'string' ? parsed.cultivation_custom : undefined,
  }
}

/** 归一化修炼多选 id（供 inject/validate） */
export function resolveCultivationIds(meta: Pick<NovelMetadata, 'cultivation_ids' | 'cultivation_id'>): string[] {
  return syncCultivationFields(meta).cultivation_ids || []
}

/** 路由用 skillKey：优先 metadata；旧数据按 preset.value 精确回填 */
export function resolveNovelGenreSkillKey(meta: NovelMetadata): string | undefined {
  const direct = (meta.novel_genre_skill_key || '').trim()
  if (direct) return direct
  return resolveSkillKeyFromGenreValue(meta.novel_genre || '') || undefined
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

const DEFAULT_AI_HUMANIZE_TARGET = DEFAULT_HUMANIZE_TARGET

export function resolveAiHumanizeTarget(meta: NovelMetadata): number {
  const n = meta.ai_humanize_target
  if (Number.isFinite(n)) {
    return Math.min(HUMANIZE_TARGET_MAX, Math.max(HUMANIZE_TARGET_MIN, Math.round(n!)))
  }
  return DEFAULT_AI_HUMANIZE_TARGET
}

/** C2：小说 meta 优先；未设则 false（文本服务 settings 由检测侧另读） */
export function resolvePreferCrossModelDetect(meta: NovelMetadata): boolean {
  return meta.prefer_cross_model_detect === true
}

/** 生成后自动平台审稿，默认开（建议级） */
export function isChapterReviewAutoEnabled(meta: NovelMetadata): boolean {
  return meta.chapter_review_auto !== false
}
