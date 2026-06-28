/** 章节级 metadata（存于 episodes.metadata JSON） */

import {
  normalizeContinuityLedger,
  type NovelContinuityLedger,
} from '../novel/novel-continuity-state.js'
import type { ContinuityCheckResult, ContinuityRewriteLogEntry } from '../novel/novel-continuity-state.js'
import { parseJsonColumnObject, type JsonColumnInput } from '../db/parse-json-column.js'

export type { ContinuityCheckResult }

export type EpisodeAiDetection = {
  probability: number
  confidence: 'low' | 'medium' | 'high'
  verdict: 'likely_human' | 'mixed' | 'likely_ai'
  char_count: number
  content_hash: string
  detected_at: string
  signals: Array<{ key: string; score: number }>
  method?: string
  elapsed_ms?: number
  perplexity?: number
  mean_logprob?: number
  analyzed_tokens?: number
  sampled_char_count?: number
  fallback_reason?: string
  suggestions?: Array<{
    kind: string
    signal_key: string
    excerpt: string
    char_start?: number
    char_end?: number
    line_number?: number
    paragraph_index?: number
    sentence_index?: number
    char_offset?: number
    match_text?: string
    phrase?: string
    count?: number
    bigram?: string
  }>
}

export type ProductionPipeline = 'ai_video' | 'frame_slideshow'

export type EpisodeMetadata = {
  /** 默认进入的工作台；同一集可同时制作 AI 视频与静帧动画 */
  production_pipeline?: ProductionPipeline
  /** 静帧管线整集拼接成片（相对路径） */
  frame_merged_url?: string
  frame_merged_duration?: number
  ai_detection?: EpisodeAiDetection
  continuity_ledger?: NovelContinuityLedger
  continuity_check?: ContinuityCheckResult
  continuity_rewrite_log?: ContinuityRewriteLogEntry[]
  /** 因果链【变更记录】元数据（与 episodes.content 正文分离） */
  causal_change_record?: string
  /** 分集图片/视频比例：character / scene / shot / video → 如 "16:9" */
  image_sizes?: Partial<Record<'character' | 'scene' | 'shot' | 'video', string>>
  /** 视频模型生成选项：是否生成模型音频、是否引导模型字幕 */
  video_gen_options?: {
    generate_audio?: boolean
    generate_subtitles?: boolean
  }
  /** 正文落盘时缓存字数，供列表/统计 SQL 使用 */
  prose_char_count?: number
}

function parseContinuityCheck(raw: unknown): ContinuityCheckResult | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const src = raw as Record<string, unknown>
  const score = Number(src.score)
  if (!Number.isFinite(score)) return undefined
  const parseAuditItems = (arr: unknown) => (
    Array.isArray(arr)
      ? arr.filter((x): x is { rule: string, message: string } =>
        x != null && typeof x === 'object'
        && typeof (x as { rule?: unknown }).rule === 'string'
        && typeof (x as { message?: unknown }).message === 'string')
      : []
  )
  const auditRaw = src.audit
  const audit = auditRaw && typeof auditRaw === 'object'
    ? {
      hard: parseAuditItems((auditRaw as Record<string, unknown>).hard),
      rule: parseAuditItems((auditRaw as Record<string, unknown>).rule),
      model: parseAuditItems((auditRaw as Record<string, unknown>).model),
      model_rejected: Array.isArray((auditRaw as Record<string, unknown>).model_rejected)
        ? ((auditRaw as Record<string, unknown>).model_rejected as unknown[])
          .filter((c): c is string => typeof c === 'string' && !!c.trim())
        : undefined,
    }
    : undefined

  const parseBlockingItems = (arr: unknown) => (
    Array.isArray(arr)
      ? arr.filter((x): x is { layer: 'hard' | 'model', rule: string, label: string, message: string } =>
        x != null && typeof x === 'object'
        && ((x as { layer?: unknown }).layer === 'hard' || (x as { layer?: unknown }).layer === 'model')
        && typeof (x as { rule?: unknown }).rule === 'string'
        && typeof (x as { label?: unknown }).label === 'string'
        && typeof (x as { message?: unknown }).message === 'string')
      : []
  )

  return {
    passed: src.passed === true,
    score: Math.min(100, Math.max(0, score)),
    conflicts: Array.isArray(src.conflicts)
      ? src.conflicts.filter((c): c is string => typeof c === 'string' && !!c.trim())
      : [],
    blocking_items: parseBlockingItems(src.blocking_items),
    summary: typeof src.summary === 'string' ? src.summary : '',
    checked_at: typeof src.checked_at === 'string' ? src.checked_at : '',
    content_hash: typeof src.content_hash === 'string' ? src.content_hash : '',
    audit: audit && (audit.hard.length || audit.rule.length || audit.model.length || audit.model_rejected?.length)
      ? audit
      : undefined,
  }
}

function readEpisodeMetadataObject(raw: JsonColumnInput): Record<string, unknown> {
  return parseJsonColumnObject(raw)
}

function parseAiDetection(ai: unknown): EpisodeAiDetection | undefined {
  if (!ai || typeof ai !== 'object') return undefined
  const src = ai as Record<string, unknown>
  const probability = Number(src.probability)
  const confidence = src.confidence
  const verdict = src.verdict
  if (!Number.isFinite(probability)) return undefined
  return {
    probability: Math.min(100, Math.max(0, probability)),
    confidence: confidence === 'low' || confidence === 'medium' || confidence === 'high'
      ? confidence : 'medium',
    verdict: verdict === 'likely_human' || verdict === 'mixed' || verdict === 'likely_ai'
      ? verdict : 'mixed',
    char_count: Number(src.char_count) || 0,
    content_hash: typeof src.content_hash === 'string' ? src.content_hash : '',
    detected_at: typeof src.detected_at === 'string' ? src.detected_at : '',
    signals: Array.isArray(src.signals)
      ? src.signals
        .filter((s: unknown) => s && typeof s === 'object')
        .map((s: { key?: string; score?: number }) => ({
          key: typeof s.key === 'string' ? s.key : 'unknown',
          score: Math.min(1, Math.max(0, Number(s.score) || 0)),
        }))
      : [],
    method: typeof src.method === 'string' ? src.method : undefined,
    elapsed_ms: Number.isFinite(Number(src.elapsed_ms)) ? Number(src.elapsed_ms) : undefined,
    perplexity: Number.isFinite(Number(src.perplexity)) ? Number(src.perplexity) : undefined,
    mean_logprob: Number.isFinite(Number(src.mean_logprob)) ? Number(src.mean_logprob) : undefined,
    analyzed_tokens: Number.isFinite(Number(src.analyzed_tokens)) ? Number(src.analyzed_tokens) : undefined,
    sampled_char_count: Number.isFinite(Number(src.sampled_char_count))
      ? Number(src.sampled_char_count) : undefined,
    fallback_reason: typeof src.fallback_reason === 'string' ? src.fallback_reason : undefined,
    suggestions: Array.isArray(src.suggestions)
      ? src.suggestions
        .filter((s: unknown) => s && typeof s === 'object')
        .map((s: {
          kind?: string
          signal_key?: string
          excerpt?: string
          char_start?: number
          char_end?: number
          line_number?: number
          paragraph_index?: number
          sentence_index?: number
          char_offset?: number
          match_text?: string
          phrase?: string
          count?: number
          bigram?: string
        }) => ({
          kind: typeof s.kind === 'string' ? s.kind : 'general',
          signal_key: typeof s.signal_key === 'string' ? s.signal_key : 'unknown',
          excerpt: typeof s.excerpt === 'string' ? s.excerpt : '',
          char_start: Number.isFinite(Number(s.char_start)) ? Number(s.char_start) : undefined,
          char_end: Number.isFinite(Number(s.char_end)) ? Number(s.char_end) : undefined,
          line_number: Number.isFinite(Number(s.line_number)) ? Number(s.line_number) : undefined,
          paragraph_index: Number.isFinite(Number(s.paragraph_index))
            ? Number(s.paragraph_index) : undefined,
          sentence_index: Number.isFinite(Number(s.sentence_index))
            ? Number(s.sentence_index) : undefined,
          char_offset: Number.isFinite(Number(s.char_offset)) ? Number(s.char_offset) : undefined,
          match_text: typeof s.match_text === 'string' ? s.match_text : undefined,
          phrase: typeof s.phrase === 'string' ? s.phrase : undefined,
          count: Number.isFinite(Number(s.count)) ? Number(s.count) : undefined,
          bigram: typeof s.bigram === 'string' ? s.bigram : undefined,
        }))
        .filter((s: { excerpt: string }) => s.excerpt.length > 0)
      : undefined,
  }
}

export function parseEpisodeMetadata(raw: JsonColumnInput): EpisodeMetadata {
  const obj = readEpisodeMetadataObject(raw)
  const ai_detection = parseAiDetection(obj.ai_detection)
  const chapterNum = Number.isFinite(Number(obj.chapter_number)) ? Number(obj.chapter_number) : 0
  const continuity_ledger = normalizeContinuityLedger(obj.continuity_ledger, chapterNum) ?? undefined
  const continuity_check = parseContinuityCheck(obj.continuity_check)
  const causal_change_record = typeof obj.causal_change_record === 'string' && obj.causal_change_record.trim()
    ? obj.causal_change_record.trim()
    : undefined
  return { ai_detection, continuity_ledger, continuity_check, causal_change_record }
}

export function mergeEpisodeMetadata(
  raw: JsonColumnInput,
  patch: Partial<EpisodeMetadata>,
): string {
  const base = readEpisodeMetadataObject(raw)
  const next: Record<string, unknown> = { ...base }
  if ('ai_detection' in patch) {
    if (patch.ai_detection) next.ai_detection = patch.ai_detection
    else delete next.ai_detection
  }
  if ('continuity_ledger' in patch) {
    if (patch.continuity_ledger) next.continuity_ledger = patch.continuity_ledger
    else delete next.continuity_ledger
  }
  if ('continuity_check' in patch) {
    if (patch.continuity_check) next.continuity_check = patch.continuity_check
    else delete next.continuity_check
  }
  if ('continuity_rewrite_log' in patch) {
    if (patch.continuity_rewrite_log?.length) next.continuity_rewrite_log = patch.continuity_rewrite_log
    else delete next.continuity_rewrite_log
  }
  if ('causal_change_record' in patch) {
    if (patch.causal_change_record?.trim()) next.causal_change_record = patch.causal_change_record.trim()
    else delete next.causal_change_record
  }
  if ('image_sizes' in patch) {
    if (patch.image_sizes && typeof patch.image_sizes === 'object') {
      const current = (base.image_sizes && typeof base.image_sizes === 'object')
        ? { ...(base.image_sizes as Record<string, string>) }
        : {}
      next.image_sizes = { ...current, ...patch.image_sizes }
    } else {
      delete next.image_sizes
    }
  }
  if ('video_gen_options' in patch) {
    if (patch.video_gen_options && typeof patch.video_gen_options === 'object') {
      const current = (base.video_gen_options && typeof base.video_gen_options === 'object')
        ? { ...(base.video_gen_options as Record<string, unknown>) }
        : {}
      next.video_gen_options = { ...current, ...patch.video_gen_options }
    } else {
      delete next.video_gen_options
    }
  }
  if ('production_pipeline' in patch) {
    if (patch.production_pipeline === 'ai_video' || patch.production_pipeline === 'frame_slideshow') {
      next.production_pipeline = patch.production_pipeline
    } else {
      delete next.production_pipeline
    }
  }
  if ('frame_merged_url' in patch) {
    if (typeof patch.frame_merged_url === 'string' && patch.frame_merged_url.trim()) {
      next.frame_merged_url = patch.frame_merged_url
    } else {
      delete next.frame_merged_url
    }
  }
  if ('frame_merged_duration' in patch) {
    if (typeof patch.frame_merged_duration === 'number' && patch.frame_merged_duration > 0) {
      next.frame_merged_duration = patch.frame_merged_duration
    } else {
      delete next.frame_merged_duration
    }
  }
  if ('prose_char_count' in patch) {
    const n = Number(patch.prose_char_count)
    if (Number.isFinite(n) && n >= 0) next.prose_char_count = Math.floor(n)
    else delete next.prose_char_count
  }
  return JSON.stringify(next)
}

export function readProductionPipeline(raw: string | null | undefined): ProductionPipeline {
  const obj = readEpisodeMetadataObject(raw)
  return obj.production_pipeline === 'frame_slideshow' ? 'frame_slideshow' : 'ai_video'
}

export function parseMotionPipelineQuery(raw: string | null | undefined): ProductionPipeline {
  return raw === 'frame_slideshow' ? 'frame_slideshow' : 'ai_video'
}

export function readEpisodeFrameMergedUrl(raw: string | null | undefined): string | null {
  const obj = readEpisodeMetadataObject(raw)
  const url = obj.frame_merged_url
  return typeof url === 'string' && url.trim() ? url : null
}

/** 读取章节 metadata 中的 continuity_ledger（不依赖 chapter_number 字段） */
export function readEpisodeContinuityLedger(
  raw: string | null | undefined,
  chapterNumber: number,
): NovelContinuityLedger | null {
  const obj = readEpisodeMetadataObject(raw)
  return normalizeContinuityLedger(obj.continuity_ledger, chapterNumber)
}
