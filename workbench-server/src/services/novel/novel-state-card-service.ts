/**
 * 章节状态卡：单章/全书串行重建；与 ledger/snapshot 对齐写库
 */
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import { now } from '../../common/http/response.js'
import type { TextBillingContext } from '../ai/ai.js'
import {
  mergeEpisodeMetadata,
  readEpisodeChapterEndSnapshotMeta,
  readEpisodeChapterStateCard,
  readEpisodeContinuityLedger,
} from '../../common/drama/episode-meta.js'
import {
  isStateCardStale,
  projectStateCardFromLedgerAndSnapshot,
  sortChapterNumbersAscending,
  STATE_CARD_SYNC_REBUILD_MAX_CHAPTERS,
  type ChapterStateCard,
} from '../../common/novel/novel-state-card.js'
import { extractChapterStateCard } from './novel-state-card-extract.js'
import { findSiblingEpisode } from '../../common/drama/project-continuity.js'
import {
  applyValidationToCard,
  mergeValidationResults,
  validateStateCardAgainstContent,
  validateStateCardNeighborSeam,
  type StateCardValidationResult,
} from './novel-state-card-validate.js'

export { STATE_CARD_SYNC_REBUILD_MAX_CHAPTERS }

export async function loadChapterStateCard(
  dramaId: number,
  chapterNumber: number,
): Promise<ChapterStateCard | null> {
  const ep = await findSiblingEpisode(dramaId, chapterNumber)
  if (!ep) return null
  return readEpisodeChapterStateCard(ep.metadata, chapterNumber)
}

export async function persistChapterStateCard(args: {
  episodeId: number
  card: ChapterStateCard
}): Promise<void> {
  const ep = await episodesRepo.findEpisodeById(args.episodeId)
  if (!ep) return
  const metadata = mergeEpisodeMetadata(ep.metadata, { chapter_state_card: args.card })
  await episodesRepo.updateEpisode(args.episodeId, { metadata, updatedAt: now() })
}

async function validateAndAttachCard(args: {
  card: ChapterStateCard
  content: string
  prevCard?: ChapterStateCard | null
}): Promise<{ card: ChapterStateCard; validation: StateCardValidationResult }> {
  const intra = validateStateCardAgainstContent(args.card, args.content)
  const seam = args.prevCard
    ? validateStateCardNeighborSeam({
      prevCard: args.prevCard,
      nextCard: args.card,
      nextOpening: args.content.slice(0, 700),
    })
    : { ok: true, status: 'ok' as const, issues: [] }
  const validation = mergeValidationResults(intra, seam)
  return { card: applyValidationToCard(args.card, validation), validation }
}

/**
 * 重建单章状态卡。
 * - preferLlm：API 手动重抽默认 true；finalize 后投影用 false
 * - 抽取后做章内+邻章缝校验；失败则再抽一次，仍失败则标 invalid 落库（不改正文）
 */
export async function rebuildChapterStateCard(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  content: string
  dramaTitle?: string
  billing?: TextBillingContext
  preferLlm?: boolean
  outlineBeats?: string
  skipIfUnchanged?: boolean
}): Promise<{
  card: ChapterStateCard | null
  source: 'llm' | 'project' | 'unchanged' | 'empty'
  validation?: StateCardValidationResult
  repaired?: boolean
}> {
  const {
    dramaId,
    episodeId,
    chapterNumber,
    content,
    dramaTitle,
    billing,
    preferLlm = true,
    outlineBeats,
    skipIfUnchanged = true,
  } = args
  const trimmed = content.trim()
  if (!trimmed) return { card: null, source: 'empty' }

  const contentHash = hashNovelContent(trimmed)
  const existing = readEpisodeChapterStateCard(
    (await episodesRepo.findEpisodeById(episodeId))?.metadata,
    chapterNumber,
  )
  if (
    skipIfUnchanged
    && existing
    && !isStateCardStale(existing, contentHash)
    && existing.validation_status === 'ok'
  ) {
    return { card: existing, source: 'unchanged' }
  }

  const ep = await episodesRepo.findEpisodeById(episodeId)
  const ledger = ep ? readEpisodeContinuityLedger(ep.metadata, chapterNumber) : null
  const snapshot = ep ? readEpisodeChapterEndSnapshotMeta(ep.metadata, chapterNumber) : null
  const prevCard = chapterNumber > 1
    ? await loadChapterStateCard(dramaId, chapterNumber - 1)
    : null

  const tryBuild = async (useLlm: boolean): Promise<{ card: ChapterStateCard | null; source: 'llm' | 'project' }> => {
    let card: ChapterStateCard | null = null
    let source: 'llm' | 'project' = 'project'
    if (useLlm) {
      try {
        card = await extractChapterStateCard({
          content: trimmed,
          chapterNumber,
          contentHash,
          prevCard,
          outlineBeats,
          dramaTitle,
          billing,
        })
        if (card) source = 'llm'
      } catch {
        card = null
      }
    }
    if (!card) {
      card = projectStateCardFromLedgerAndSnapshot({
        chapterNumber,
        contentHash,
        ledger,
        snapshot,
      })
      source = 'project'
    }
    return { card, source }
  }

  let { card, source } = await tryBuild(preferLlm)
  if (!card) return { card: null, source: 'empty' }

  let { card: validated, validation } = await validateAndAttachCard({
    card,
    content: trimmed,
    prevCard,
  })
  let repaired = false

  if (!validation.ok && preferLlm && source !== 'llm') {
    const second = await tryBuild(true)
    if (second.card) {
      const again = await validateAndAttachCard({
        card: second.card,
        content: trimmed,
        prevCard,
      })
      validated = again.card
      validation = again.validation
      source = second.source
      repaired = true
    }
  } else if (!validation.ok && preferLlm && source === 'llm') {
    // 再投一次投影作对照；仍以校验更优者为准
    const projected = projectStateCardFromLedgerAndSnapshot({
      chapterNumber,
      contentHash,
      ledger,
      snapshot,
    })
    if (projected) {
      const again = await validateAndAttachCard({
        card: projected,
        content: trimmed,
        prevCard,
      })
      if (again.validation.ok || again.validation.issues.length < validation.issues.length) {
        validated = again.card
        validation = again.validation
        source = 'project'
        repaired = true
      }
    }
  }

  await persistChapterStateCard({ episodeId, card: validated })
  return { card: validated, source, validation, repaired }
}

export type StateCardRebuildProgress = {
  current: number
  total: number
  chapter_number: number
  phase: 'state_card'
}

export type StateCardRebuildSummary = {
  processed: number
  skipped: number
  failed: number
  invalid: number
  repaired: number
  stopped_at?: number
  error?: string
  errors: Array<{ chapter: number; message: string }>
}

/**
 * 全书按章号升序串行重建（并发 1）。失败默认中止。
 */
export async function rebuildAllChapterStateCards(args: {
  dramaId: number
  billing?: TextBillingContext
  preferLlm?: boolean
  stopOnError?: boolean
  shouldStop?: () => boolean | Promise<boolean>
  onProgress?: (p: StateCardRebuildProgress) => void
}): Promise<StateCardRebuildSummary> {
  const {
    dramaId,
    billing,
    preferLlm = true,
    stopOnError = true,
    shouldStop,
    onProgress,
  } = args
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama) {
    return {
      processed: 0,
      skipped: 0,
      failed: 0,
      invalid: 0,
      repaired: 0,
      errors: [{ chapter: 0, message: '项目不存在' }],
    }
  }

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const withContent = episodes.filter(e => (e.content || e.scriptContent || '').trim())
  const orderedNums = sortChapterNumbersAscending(withContent.map(e => e.episodeNumber))
  const byNum = new Map(withContent.map(e => [e.episodeNumber, e]))

  const summary: StateCardRebuildSummary = {
    processed: 0,
    skipped: 0,
    failed: 0,
    invalid: 0,
    repaired: 0,
    errors: [],
  }

  let idx = 0
  for (const n of orderedNums) {
    if (shouldStop && await shouldStop()) {
      summary.stopped_at = n
      summary.error = '已取消'
      break
    }
    const ep = byNum.get(n)
    if (!ep) continue
    idx += 1
    onProgress?.({
      current: idx,
      total: orderedNums.length,
      chapter_number: n,
      phase: 'state_card',
    })
    const text = (ep.content || ep.scriptContent || '').trim()
    try {
      const result = await rebuildChapterStateCard({
        dramaId,
        episodeId: ep.id,
        chapterNumber: n,
        content: text,
        dramaTitle: drama.title,
        billing,
        preferLlm,
        skipIfUnchanged: false,
      })
      if (result.source === 'unchanged') summary.skipped += 1
      else if (result.card) {
        summary.processed += 1
        if (result.repaired) summary.repaired += 1
        if (result.card.validation_status === 'invalid') {
          summary.invalid += 1
          summary.errors.push({
            chapter: n,
            message: (result.card.validation_issues || ['状态卡校验未通过']).join('；'),
          })
        }
      } else {
        summary.failed += 1
        summary.errors.push({ chapter: n, message: '无法生成状态卡' })
        if (stopOnError) {
          summary.stopped_at = n
          summary.error = `第${n}章状态卡生成失败`
          break
        }
      }
    } catch (err: any) {
      summary.failed += 1
      const message = err?.message || '状态卡重建失败'
      summary.errors.push({ chapter: n, message })
      if (stopOnError) {
        summary.stopped_at = n
        summary.error = message
        break
      }
    }
  }

  return summary
}

export async function listChapterStateCardSummaries(dramaId: number): Promise<Array<{
  chapter_number: number
  stale: boolean
  updated_at?: string
  summary_line?: string
  has_card: boolean
  validation_status?: string
  validation_issues?: string[]
}>> {
  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  return episodes.map((ep) => {
    const text = (ep.content || ep.scriptContent || '').trim()
    const hash = text ? hashNovelContent(text) : ''
    const card = readEpisodeChapterStateCard(ep.metadata, ep.episodeNumber)
    return {
      chapter_number: ep.episodeNumber,
      has_card: !!card,
      stale: !card || isStateCardStale(card, hash),
      updated_at: card?.updated_at,
      summary_line: card?.summary_line,
      validation_status: card?.validation_status,
      validation_issues: card?.validation_issues,
    }
  })
}

/**
 * 只校验（可选择对 invalid 重抽修复）。全书串行，一章一次。
 */
export async function validateAllChapterStateCards(args: {
  dramaId: number
  billing?: TextBillingContext
  repairInvalid?: boolean
  shouldStop?: () => boolean | Promise<boolean>
  onProgress?: (p: StateCardRebuildProgress) => void
}): Promise<StateCardRebuildSummary & { checked: number }> {
  const { dramaId, billing, repairInvalid = true, shouldStop, onProgress } = args
  const drama = await dramasRepo.findDramaById(dramaId)
  const empty: StateCardRebuildSummary & { checked: number } = {
    processed: 0,
    skipped: 0,
    failed: 0,
    invalid: 0,
    repaired: 0,
    checked: 0,
    errors: [],
  }
  if (!drama) {
    return { ...empty, errors: [{ chapter: 0, message: '项目不存在' }] }
  }

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const withContent = episodes.filter(e => (e.content || e.scriptContent || '').trim())
  const orderedNums = sortChapterNumbersAscending(withContent.map(e => e.episodeNumber))
  const byNum = new Map(withContent.map(e => [e.episodeNumber, e]))
  const summary = { ...empty }
  let prevCard: ChapterStateCard | null = null
  let idx = 0

  for (const n of orderedNums) {
    if (shouldStop && await shouldStop()) {
      summary.stopped_at = n
      summary.error = '已取消'
      break
    }
    const ep = byNum.get(n)
    if (!ep) continue
    idx += 1
    onProgress?.({
      current: idx,
      total: orderedNums.length,
      chapter_number: n,
      phase: 'state_card',
    })
    const text = (ep.content || ep.scriptContent || '').trim()
    summary.checked += 1
    let card = readEpisodeChapterStateCard(ep.metadata, n)
    if (!card || isStateCardStale(card, hashNovelContent(text))) {
      if (repairInvalid) {
        const rebuilt = await rebuildChapterStateCard({
          dramaId,
          episodeId: ep.id,
          chapterNumber: n,
          content: text,
          dramaTitle: drama.title,
          billing,
          preferLlm: true,
          skipIfUnchanged: false,
        })
        card = rebuilt.card
        if (rebuilt.repaired) summary.repaired += 1
        if (card) summary.processed += 1
      } else {
        summary.invalid += 1
        summary.errors.push({ chapter: n, message: '状态卡缺失或过期' })
        prevCard = card
        continue
      }
    } else {
      const { card: validated, validation } = await validateAndAttachCard({
        card,
        content: text,
        prevCard,
      })
      if (!validation.ok && repairInvalid) {
        const rebuilt = await rebuildChapterStateCard({
          dramaId,
          episodeId: ep.id,
          chapterNumber: n,
          content: text,
          dramaTitle: drama.title,
          billing,
          preferLlm: true,
          skipIfUnchanged: false,
        })
        card = rebuilt.card
        if (rebuilt.repaired) summary.repaired += 1
        summary.processed += 1
      } else {
        await persistChapterStateCard({ episodeId: ep.id, card: validated })
        card = validated
        summary.skipped += 1
      }
    }

    if (card?.validation_status === 'invalid') {
      summary.invalid += 1
      summary.errors.push({
        chapter: n,
        message: (card.validation_issues || ['校验未通过']).join('；'),
      })
    }
    prevCard = card
  }

  return summary
}

/** finalize 后：用最新 ledger/snapshot 投影写卡并做结构校验（不再二次 LLM） */
export async function syncStateCardAfterFinalize(args: {
  episodeId: number
  chapterNumber: number
  content: string
  dramaId?: number
  ledger: import('../../common/novel/novel-continuity-state.js').NovelContinuityLedger | null
}): Promise<ChapterStateCard | null> {
  const trimmed = args.content.trim()
  if (!trimmed) return null
  const contentHash = hashNovelContent(trimmed)
  const ep = await episodesRepo.findEpisodeById(args.episodeId)
  const snapshot = ep
    ? readEpisodeChapterEndSnapshotMeta(ep.metadata, args.chapterNumber)
    : null
  let card = projectStateCardFromLedgerAndSnapshot({
    chapterNumber: args.chapterNumber,
    contentHash,
    ledger: args.ledger,
    snapshot,
  })
  if (!card) return null
  const dramaId = args.dramaId ?? (ep as { dramaId?: number } | null)?.dramaId
  const prevCard = dramaId && args.chapterNumber > 1
    ? await loadChapterStateCard(dramaId, args.chapterNumber - 1)
    : null
  const { card: validated } = await validateAndAttachCard({
    card,
    content: trimmed,
    prevCard,
  })
  await persistChapterStateCard({ episodeId: args.episodeId, card: validated })
  return validated
}
