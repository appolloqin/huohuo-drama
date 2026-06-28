/** 小说章节一致性账本（15 维结构化状态，存于 episodes.metadata.continuity_ledger） */

export type { ContinuityBlockingItem, ContinuityAuditLayer } from './novel-continuity-rules.js'
import type { ContinuityBlockingItem } from './novel-continuity-rules.js'

export type NovelContinuityFields = {
  environment?: string
  realm?: string
  resources?: string
  appearance?: string
  personality?: string
  injuries?: string
  timeline?: string
  relations?: string
  foreshadowing?: string
  actions?: string
  knowledge?: string
  abilities?: string
  emotion?: string
  reminder?: string
  /** 本章相对上章的主要状态变化（便于检索） */
  delta?: string
}

export type NovelContinuityLedger = NovelContinuityFields & {
  chapter_number: number
  updated_at: string
  content_hash?: string
}

/** 全书「当前状态」快照（存于 dramas.metadata.continuity_state） */
export type NovelGlobalContinuityState = NovelContinuityFields & {
  as_of_chapter: number
  updated_at: string
}

export type ContinuityAuditItem = {
  rule: string
  message: string
}

/** 审校分层：硬审（结构化高精度）、规则审（软提示）、模型审（语义/人名剧情） */
export type ContinuityAuditBreakdown = {
  hard: ContinuityAuditItem[]
  rule: ContinuityAuditItem[]
  model: ContinuityAuditItem[]
  /** 模型输出但缺少可核对正文摘录，已丢弃 */
  model_rejected?: string[]
}

export type ContinuityCheckResult = {
  passed: boolean
  score: number
  /** 须修正的硬伤（带 [硬审/模型审·规则名] 前缀，便于展示） */
  conflicts: string[]
  /** 结构化拦截项（含规则码与审校层） */
  blocking_items: ContinuityBlockingItem[]
  summary: string
  checked_at: string
  content_hash: string
  audit?: ContinuityAuditBreakdown
}

/** 单章一致性修正尝试记录（存于 episodes.metadata.continuity_rewrite_log） */
export type ContinuityRewriteLogEntry = {
  attempt: number
  score: number
  conflicts: string[]
  blocking_items?: ContinuityBlockingItem[]
  summary: string
  patch_changed: boolean
  mode: 'patch' | 'regen'
  at: string
}

const FIELD_LABELS: Record<keyof NovelContinuityFields, string> = {
  environment: '环境场景',
  realm: '修为境界',
  resources: '资源道具',
  appearance: '神态衣着',
  personality: '人设口吻',
  injuries: '身体伤势',
  timeline: '时间节奏',
  relations: '人际势力',
  foreshadowing: '伏笔设定',
  actions: '动作逻辑',
  knowledge: '认知记忆',
  abilities: '功法能力',
  emotion: '情绪递进',
  reminder: '一致性提醒',
  delta: '本章变化',
}

const CONTINUITY_FIELD_KEYS = Object.keys(FIELD_LABELS) as (keyof NovelContinuityFields)[]

function cleanField(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

export function normalizeContinuityFields(raw: unknown): NovelContinuityFields {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: NovelContinuityFields = {}
  for (const key of CONTINUITY_FIELD_KEYS) {
    const val = cleanField(src[key])
    if (val) out[key] = val
  }
  return out
}

export function normalizeContinuityLedger(raw: unknown, chapterNumber: number): NovelContinuityLedger | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const fields = normalizeContinuityFields(src)
  if (!Object.keys(fields).length) return null
  const num = Number.isFinite(Number(src.chapter_number)) ? Number(src.chapter_number) : chapterNumber
  return {
    ...fields,
    chapter_number: num,
    updated_at: typeof src.updated_at === 'string' ? src.updated_at : new Date().toISOString(),
    content_hash: typeof src.content_hash === 'string' ? src.content_hash : undefined,
  }
}

export function normalizeGlobalContinuityState(raw: unknown): NovelGlobalContinuityState | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const fields = normalizeContinuityFields(src)
  const asOf = Number(src.as_of_chapter)
  if (!Number.isFinite(asOf) || asOf < 1) return null
  if (!Object.keys(fields).length) return null
  return {
    ...fields,
    as_of_chapter: asOf,
    updated_at: typeof src.updated_at === 'string' ? src.updated_at : new Date().toISOString(),
  }
}

export function ledgerToGlobal(ledger: NovelContinuityLedger): NovelGlobalContinuityState {
  const { chapter_number, content_hash: _h, updated_at, ...fields } = ledger
  return {
    ...fields,
    as_of_chapter: chapter_number,
    updated_at,
  }
}

export function formatContinuityStateBlock(
  fields: NovelContinuityFields,
  opts?: { title?: string; asOfChapter?: number },
): string {
  const title = opts?.title ?? (opts?.asOfChapter
    ? `【全书当前状态（截至第 ${opts.asOfChapter} 章末）——须严格对齐，禁止吃书】`
    : '【状态账本——须严格对齐前文，禁止吃书】')
  const lines = [title]
  for (const key of CONTINUITY_FIELD_KEYS) {
    const val = fields[key]
    if (val) lines.push(`${FIELD_LABELS[key]}：${val}`)
  }
  if (lines.length === 1) return ''
  return lines.join('\n')
}

export function parseContinuityJsonFromModel(text: string): NovelContinuityFields | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  try {
    const parsed = JSON.parse(candidate)
    const fields = normalizeContinuityFields(parsed)
    return Object.keys(fields).length ? fields : null
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const fields = normalizeContinuityFields(JSON.parse(candidate.slice(start, end + 1)))
        return Object.keys(fields).length ? fields : null
      } catch {
        return null
      }
    }
    return null
  }
}
