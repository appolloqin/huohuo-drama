/**
 * 章节状态卡：跨章一致性主事实投影（时间/地点/场景/人物/进度/道具）
 * 注入与审核只取邻章卡，禁止全书倾倒。
 */
import type { ChapterEndSnapshot, NovelContinuityLedger } from './novel-continuity-state.js'

export const CHAPTER_STATE_CARD_SCHEMA_VERSION = 1 as const

/** ≤40 章可同步重建；超过则必须走 batch-job */
export const STATE_CARD_SYNC_REBUILD_MAX_CHAPTERS = 40

export type ChapterStateCardProgress = {
  catalyst_done: boolean | 'unknown'
  last_event: string
  open_threads?: string
  closed_beats?: string
}

export type ChapterStateCardValidationStatus = 'ok' | 'invalid' | 'unchecked'

export type ChapterStateCard = {
  chapter_number: number
  content_hash: string
  updated_at: string
  schema_version: typeof CHAPTER_STATE_CARD_SCHEMA_VERSION
  timeline: string
  place: string
  scene: string
  cast: string
  progress: ChapterStateCardProgress
  props: string
  summary_line?: string
  /** 校验状态：ok / invalid / unchecked */
  validation_status?: ChapterStateCardValidationStatus
  /** 校验问题（短句，最多几条） */
  validation_issues?: string[]
  validated_at?: string
}

function charLen(s: string): number {
  return [...s].length
}

function truncChars(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (charLen(t) <= max) return t
  return `${[...t].slice(0, max).join('')}…`
}

function cleanLine(v: unknown, max = 80): string {
  if (typeof v !== 'string') return ''
  let t = v.replace(/\s+/g, ' ').trim()
  // 去掉模型偶发粘在句首/句末的弯引号
  t = t.replace(/^[“”"＇]+/, '').replace(/[“”"＇]+$/, '').trim()
  if (!t || t === '无' || t === '持平' || t === '未明示') return ''
  return truncChars(t, max)
}

export function normalizeChapterStateCard(
  raw: unknown,
  chapterNumber: number,
): ChapterStateCard | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const timeline = cleanLine(src.timeline, 80)
  const place = cleanLine(src.place, 80)
  const scene = cleanLine(src.scene, 80)
  const cast = cleanLine(src.cast, 80)
  const props = cleanLine(src.props, 100)
  const progRaw = src.progress && typeof src.progress === 'object'
    ? src.progress as Record<string, unknown>
    : src
  const last_event = cleanLine(progRaw.last_event ?? src.last_event, 120)
  if (!timeline && !place && !scene && !cast && !last_event && !props) return null

  let catalyst_done: boolean | 'unknown' = 'unknown'
  if (progRaw.catalyst_done === true || progRaw.catalyst_done === false) {
    catalyst_done = progRaw.catalyst_done
  } else if (progRaw.catalyst_done === 'unknown') {
    catalyst_done = 'unknown'
  }

  const num = Number.isFinite(Number(src.chapter_number))
    ? Number(src.chapter_number)
    : chapterNumber

  const vs = src.validation_status
  const validation_status: ChapterStateCardValidationStatus | undefined =
    vs === 'ok' || vs === 'invalid' || vs === 'unchecked' ? vs : undefined
  const issuesRaw = Array.isArray(src.validation_issues)
    ? src.validation_issues.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 6)
    : undefined

  const card: ChapterStateCard = {
    chapter_number: num,
    content_hash: typeof src.content_hash === 'string' ? src.content_hash : '',
    updated_at: typeof src.updated_at === 'string' ? src.updated_at : new Date().toISOString(),
    schema_version: CHAPTER_STATE_CARD_SCHEMA_VERSION,
    timeline: timeline || '未明示',
    place: place || '未明示',
    scene: scene || '未明示',
    cast: cast || '未明示',
    progress: {
      catalyst_done,
      last_event: last_event || '未明示',
      open_threads: cleanLine(progRaw.open_threads ?? src.open_threads, 120) || undefined,
      closed_beats: cleanLine(progRaw.closed_beats ?? src.closed_beats, 160) || undefined,
    },
    props: props || '未明示',
    summary_line: cleanLine(src.summary_line, 120) || undefined,
    validation_status,
    validation_issues: issuesRaw?.length ? issuesRaw.map(s => truncChars(s, 120)) : undefined,
    validated_at: typeof src.validated_at === 'string' ? src.validated_at : undefined,
  }
  return card
}

/** 写回校验结果（不改事实字段） */
export function withStateCardValidation(
  card: ChapterStateCard,
  status: ChapterStateCardValidationStatus,
  issues: string[] = [],
): ChapterStateCard {
  return {
    ...card,
    validation_status: status,
    validation_issues: issues.length ? issues.slice(0, 6).map(s => truncChars(s, 120)) : undefined,
    validated_at: new Date().toISOString(),
  }
}

export function isStateCardStale(
  card: ChapterStateCard | null | undefined,
  contentHash: string,
): boolean {
  if (!card?.content_hash || !contentHash) return true
  return card.content_hash !== contentHash
}

/** 无 LLM：从账本 + 章末契约投影状态卡 */
export function projectStateCardFromLedgerAndSnapshot(args: {
  chapterNumber: number
  contentHash: string
  ledger?: NovelContinuityLedger | null
  snapshot?: ChapterEndSnapshot | null
}): ChapterStateCard | null {
  const { chapterNumber, contentHash, ledger, snapshot } = args
  const timeline = cleanLine(ledger?.timeline, 80) || cleanLine(snapshot?.time, 80)
  const place = cleanLine(snapshot?.place, 80) || cleanLine(ledger?.environment, 80)
  const scene = cleanLine(ledger?.environment, 80) || cleanLine(snapshot?.place, 80)
  const cast = cleanLine(snapshot?.cast, 80) || cleanLine(ledger?.relations, 80)
  const last_event = cleanLine(snapshot?.last_event, 120)
    || cleanLine(ledger?.actions, 120)
    || cleanLine(ledger?.delta, 120)
  const propsParts = [cleanLine(ledger?.appearance, 50), cleanLine(ledger?.resources, 50)].filter(Boolean)
  const props = truncChars(propsParts.join('；'), 100)
  if (!timeline && !place && !scene && !cast && !last_event && !props) return null

  const summary = truncChars(
    [place || scene, last_event].filter(Boolean).join(' · '),
    120,
  )

  return normalizeChapterStateCard({
    chapter_number: chapterNumber,
    content_hash: contentHash,
    updated_at: new Date().toISOString(),
    schema_version: CHAPTER_STATE_CARD_SCHEMA_VERSION,
    timeline: timeline || '未明示',
    place: place || '未明示',
    scene: scene || '未明示',
    cast: cast || '未明示',
    progress: {
      catalyst_done: 'unknown',
      last_event: last_event || '未明示',
      open_threads: cleanLine(snapshot?.open_threads || ledger?.foreshadowing, 120) || undefined,
      closed_beats: cleanLine(snapshot?.closed_beats, 160) || undefined,
    },
    props: props || '未明示',
    summary_line: summary || undefined,
  }, chapterNumber)
}

/** 状态卡 6 维中文名（审校注入/验收用） */
export const STATE_CARD_SIX_DIM_LABELS = [
  '时间线',
  '地点',
  '场景',
  '人物',
  '刚发生',
  '道具/衣着',
] as const

function formatOneCard(card: ChapterStateCard, role: 'prev' | 'next'): string {
  const title = role === 'prev'
    ? `【上章状态卡·第${card.chapter_number}章末——开篇必须承接】`
    : `【下章状态卡·第${card.chapter_number}章——章末勿偷写】`
  return [
    title,
    `时间线：${card.timeline}`,
    `地点：${card.place}`,
    `场景：${card.scene}`,
    `人物：${card.cast}`,
    `刚发生：${card.progress.last_event}`,
    card.progress.open_threads ? `未闭合：${card.progress.open_threads}` : '',
    card.progress.closed_beats ? `已闭合：${card.progress.closed_beats}` : '',
    `道具/衣着：${card.props}`,
    card.summary_line ? `摘要：${card.summary_line}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * 模型审用：显式标注状态卡 6 维（含未闭合/已闭合附属）。
 */
export function formatStateCardSixDimAuditBlock(
  card: ChapterStateCard,
  role: 'prev' | 'next' | 'curr' = 'prev',
): string {
  const roleTitle = role === 'prev'
    ? `【状态卡·6维·上章第${card.chapter_number}章末——开篇须承接】`
    : role === 'next'
      ? `【状态卡·6维·下章第${card.chapter_number}章——章末勿偷写】`
      : `【状态卡·6维·本章第${card.chapter_number}章】`
  return [
    roleTitle,
    '须按 6 维检查逻辑自洽（允许合法倒叙/补叙；禁止无交代推翻已成立事实）：',
    `时间线：${card.timeline}`,
    `地点：${card.place}`,
    `场景：${card.scene}`,
    `人物：${card.cast}`,
    `刚发生：${card.progress.last_event}`,
    card.progress.open_threads ? `未闭合：${card.progress.open_threads}` : '',
    card.progress.closed_beats ? `已闭合：${card.progress.closed_beats}` : '',
    `道具/衣着：${card.props}`,
    card.summary_line ? `摘要：${card.summary_line}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * 邻章注入块：仅 N-1 / N+1，禁止全书倾倒。
 */
export function formatNeighborStateCardsBlock(args: {
  prevCard?: ChapterStateCard | null
  nextCard?: ChapterStateCard | null
}): string {
  const parts: string[] = []
  if (args.prevCard) parts.push(formatOneCard(args.prevCard, 'prev'))
  if (args.nextCard) parts.push(formatOneCard(args.nextCard, 'next'))
  if (!parts.length) return ''
  return [
    '【邻章状态卡（仅上/下章；禁止倒退时/地/场景/人物/已成立过程/道具归属）】',
    ...parts,
    '硬性：开篇承接上章卡；章末勿完成下章卡已记录主事件；已成立天候/过程勿写成「才开始」除非卡上时间线已跨日/另一场。',
  ].join('\n')
}

/** 排序章号（升序），供全书串行重建 */
export function sortChapterNumbersAscending(nums: number[]): number[] {
  return [...new Set(nums.filter(n => Number.isFinite(n) && n >= 1))].sort((a, b) => a - b)
}
