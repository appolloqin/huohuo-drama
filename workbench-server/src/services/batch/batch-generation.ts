import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../../common/http/response.js'
import { isNovelProject, parseNovelMetadata } from '../../common/novel/novel-meta.js'
import { generateNovelWritingBrief, summarizeNovelChapterLength } from '../novel/novel-writing.js'
import { ensureNovelMemory } from '../novel/novel-memory/index.js'
import { looksLikeModelThinkingLeak } from '../ai/ai.js'
import { isUsableNovelCreativeOutput } from '../../common/novel/novel-creative-output.js'
import { runNovelChapterPipeline } from '../novel/novel-chapter-pipeline.js'
import {
  isContinuityRewriteAbortError,
  mustAbortBatchOnContinuityError,
} from '../novel/novel-continuity-errors.js'
import { buildCanonLockPrefix } from '../novel/novel-continuity.js'
import { assertHuohuoAgentReady, assertUserServiceConfigReady, isHuohuoPresetEffective } from '../ai/ai.js'
import { assertUserCanGenerate } from '../credits/credits.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { extractChapterOutline } from '../../common/novel/novel-outline.js'
import { mergeEpisodeMetadata, type ProductionPipeline } from '../../common/drama/episode-meta.js'
import { isDramaEpisodePending, isDramaEpisodeMergedForPipeline } from '../../common/drama/drama-episode-status.js'
import { BatchStoppedError, runDramaEpisodePipeline, type DramaPipelinePhase } from '../drama/drama-episode-pipeline.js'
import type { ContinuityBlockingItem } from '../../common/novel/novel-continuity-rules.js'

export type BatchScope = {
  /** remaining=未撰写；all=全部；range=区间；chapters=指定章/集号 */
  mode?: 'remaining' | 'all' | 'range' | 'chapters'
  chapter_numbers?: number[]
  from_chapter?: number
  to_chapter?: number
  overwrite?: boolean
  /** 数字导演：批量出片方式（写入各集 metadata.production_pipeline） */
  production_pipeline?: ProductionPipeline
}

export type BatchProgressPayload = {
  index: number
  total: number
  episode_id: number
  episode_number: number
  phase?: 'raw' | 'rewrite' | 'chapter' | 'brief' | 'check' | DramaPipelinePhase
  status: 'start' | 'done' | 'skip' | 'error'
  message?: string
  rewrite_attempt?: number
  check_score?: number
  check_summary?: string
  conflicts?: string[]
  blocking_items?: ContinuityBlockingItem[]
  rule_hints?: string[]
  model_rejected?: string[]
  rewrite_mode?: 'patch' | 'regen'
}

export type BatchSummary = {
  generated: number
  skipped: number
  failed: number
  errors: Array<{ episode_number: number; message: string }>
}

type ProgressFn = (payload: BatchProgressPayload) => void

function resolveNovelChapterOutline(ep: { episodeNumber: number; description: string | null }, drama: { metadata: string | null }) {
  const custom = ep.description?.trim()
  if (custom) return custom
  const meta = parseNovelMetadata(drama.metadata)
  return extractChapterOutline(meta.outline || '', ep.episodeNumber)
}

function assertChapterLengthOrThrow(content: string, targetLength: number, chapterNumber: number) {
  const minLen = Math.round(Math.min(20000, Math.max(500, targetLength)) * 0.88)
  const { chars, within } = summarizeNovelChapterLength(content, minLen, Math.round(targetLength * 1.08))
  if (within) return
  if (chars < minLen * 0.55) {
    throw new Error(`第${chapterNumber}章正文过短（${chars} 字，目标至少 ${minLen} 字），疑似未写完，已中止批量撰写`)
  }
}
function resolveNovelPrompt(ep: { scriptContent: string | null }, chapterOutline: string, premise: string) {
  const brief = (ep.scriptContent || '').trim()
  if (brief && isUsableNovelCreativeOutput(brief, 'writing_brief')) return brief
  if (chapterOutline) return chapterOutline
  if (premise.trim()) return `按全书梗概与大纲继续撰写本章正文。梗概参考：${premise.trim().slice(0, 800)}`
  return ''
}

type EpisodeRow = {
  id: number
  episodeNumber: number
  title: string
  content: string | null
  scriptContent: string | null
  videoUrl: string | null
  description: string | null
  metadata: string | null
}

function resolveBatchTargets(
  episodes: EpisodeRow[],
  scope: BatchScope | undefined,
  isEmpty: (e: EpisodeRow) => boolean,
): EpisodeRow[] {
  const sorted = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
  const mode = scope?.mode ?? 'remaining'
  const allowWritten = scope?.overwrite === true

  if (mode === 'remaining') {
    return sorted.filter(isEmpty)
  }

  if (mode === 'all') {
    return allowWritten ? sorted : sorted.filter(isEmpty)
  }

  if (mode === 'range') {
    const from = Math.max(1, Number(scope?.from_chapter) || 1)
    const to = Math.max(from, Number(scope?.to_chapter) || from)
    return sorted
      .filter(e => e.episodeNumber >= from && e.episodeNumber <= to)
      .filter(e => allowWritten || isEmpty(e))
  }

  if (mode === 'chapters') {
    const nums = new Set(
      (scope?.chapter_numbers ?? [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n >= 1),
    )
    return sorted
      .filter(e => nums.has(e.episodeNumber))
      .filter(e => allowWritten || isEmpty(e))
  }

  return sorted.filter(isEmpty)
}

function resolveNovelBatchTargets(episodes: EpisodeRow[], scope?: BatchScope): EpisodeRow[] {
  return resolveBatchTargets(episodes, scope, e => !(e.content || '').trim())
}

function resolveDramaBatchTargets(episodes: EpisodeRow[], scope?: BatchScope): EpisodeRow[] {
  const pipeline = scope?.production_pipeline
  const isPending = (e: EpisodeRow) => {
    if (pipeline) {
      return !isDramaEpisodeMergedForPipeline(
        { videoUrl: e.videoUrl, metadata: e.metadata },
        pipeline,
      )
    }
    return isDramaEpisodePending(e.videoUrl, e.metadata)
  }
  return resolveBatchTargets(episodes, scope, isPending)
}

export async function batchGenerateNovelChapters(args: {
  dramaId: number
  userId: number
  userRole: string
  onProgress: ProgressFn
  shouldStop?: () => boolean
  scope?: BatchScope
}): Promise<BatchSummary> {
  const { dramaId, userId, userRole, onProgress, shouldStop, scope } = args
  await assertUserCanGenerate(userId, userRole)
  await assertUserServiceConfigReady(userId, userRole, 'text')

  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || drama.userId !== userId || drama.deletedAt || !isNovelProject(drama)) {
    throw new Error('小说项目不存在')
  }

  const meta = parseNovelMetadata(drama.metadata)
  const premise = meta.premise || drama.description || ''
  const twoPhase = meta.batch_two_phase !== false
  const strictContinuity = meta.continuity_strict !== false
  const stopOnError = meta.batch_stop_on_error !== false

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const pending = resolveNovelBatchTargets(episodes, scope)
  const summary: BatchSummary = { generated: 0, skipped: 0, failed: 0, errors: [] }

  if (!pending.length) return summary

  onProgress({
    index: 0,
    total: pending.length,
    episode_id: pending[0]!.id,
    episode_number: pending[0]!.episodeNumber,
    phase: twoPhase ? 'brief' : 'chapter',
    status: 'start',
  })

  if (meta.long_memory_enabled !== false) {
    ensureNovelMemory(dramaId, {
      outline: meta.outline,
      premise,
      title: drama.title,
    })
  }

  logTaskStart('Novel', 'batch-generate-chapters', { dramaId, pending: pending.length, mode: scope?.mode ?? 'remaining' })

  let index = 0
  for (const ep of pending) {
    if (shouldStop?.()) break
    index += 1

    const chapterOutline = resolveNovelChapterOutline(ep, drama)
    let prompt = resolveNovelPrompt(ep, chapterOutline, premise)
    if (!prompt && !chapterOutline) {
      summary.skipped += 1
      onProgress({
        index,
        total: pending.length,
        episode_id: ep.id,
        episode_number: ep.episodeNumber,
        phase: 'chapter',
        status: 'skip',
        message: '缺少本章大纲或梗概',
      })
      continue
    }

    try {
      await assertUserCanGenerate(userId, userRole)

      let writingBrief = (ep.scriptContent || '').trim()
      if (looksLikeModelThinkingLeak(writingBrief) || !isUsableNovelCreativeOutput(writingBrief, 'writing_brief')) {
        writingBrief = ''
      }
      if (twoPhase && !writingBrief) {
        onProgress({
          index,
          total: pending.length,
          episode_id: ep.id,
          episode_number: ep.episodeNumber,
          phase: 'brief',
          status: 'start',
        })
        const briefKeywords = chapterOutline?.slice(0, 500) || ep.title || `第${ep.episodeNumber}章`
        writingBrief = await generateNovelWritingBrief({
          keywords: briefKeywords,
          dramaTitle: drama.title,
          chapterNumber: ep.episodeNumber,
          chapterTitle: ep.title,
          chapterOutline,
          genre: meta.novel_genre || drama.genre || undefined,
          dramaId: drama.id,
          chapterId: ep.id,
          meta,
        }, {
          userId,
          role: userRole,
          reason: '数字作家批量写作说明',
          resourceType: 'novel',
          resourceId: ep.id,
        })
        await episodesRepo.updateEpisode(ep.id, { scriptContent: writingBrief, updatedAt: now() })
        onProgress({
          index,
          total: pending.length,
          episode_id: ep.id,
          episode_number: ep.episodeNumber,
          phase: 'brief',
          status: 'done',
        })
      }

      prompt = writingBrief || prompt
      const canonPrefix = await buildCanonLockPrefix(drama.id, ep.episodeNumber)
      if (canonPrefix) {
        prompt = prompt.includes('前序已锁定事实')
          ? prompt
          : `${canonPrefix}\n\n${prompt}`
      }
      if (!prompt) {
        summary.skipped += 1
        onProgress({
          index,
          total: pending.length,
          episode_id: ep.id,
          episode_number: ep.episodeNumber,
          phase: 'chapter',
          status: 'skip',
          message: '缺少写作说明',
        })
        continue
      }

      onProgress({
        index,
        total: pending.length,
        episode_id: ep.id,
        episode_number: ep.episodeNumber,
        phase: 'chapter',
        status: 'start',
      })

      const targetLength = meta.target_chapter_chars && meta.target_chapter_chars >= 500
        ? meta.target_chapter_chars
        : 3000

      const billing = {
        userId,
        role: userRole,
        reason: '数字作家批量生成',
        resourceType: 'novel' as const,
        resourceId: ep.id,
      }

      let progressPhase = 'chapter'
      const pipeline = await runNovelChapterPipeline({
        generateArgs: {
          dramaTitle: drama.title,
          chapterNumber: ep.episodeNumber,
          chapterTitle: ep.title,
          prompt,
          chapterOutline,
          meta,
          dramaId: drama.id,
          chapterId: ep.id,
          existingText: '',
          targetLength,
        },
        dramaId: drama.id,
        episodeId: ep.id,
        chapterNumber: ep.episodeNumber,
        dramaTitle: drama.title,
        meta,
        chapterOutline,
        billing,
        strictContinuity,
        skipFinalizeWhenCheckFails: strictContinuity,
        shouldStop,
        onPhase: (phase, detail) => {
          progressPhase = phase
          onProgress({
            index,
            total: pending.length,
            episode_id: ep.id,
            episode_number: ep.episodeNumber,
            phase,
            status: 'start',
            rewrite_attempt: detail?.rewriteAttempt,
            check_score: detail?.score,
            check_summary: detail?.summary,
            conflicts: detail?.conflicts,
            blocking_items: detail?.blocking_items,
            rule_hints: detail?.rule_hints,
            model_rejected: detail?.model_rejected,
            rewrite_mode: detail?.mode,
          })
        },
      })

      assertChapterLengthOrThrow(pipeline.content, targetLength, ep.episodeNumber)

      const metadataPatch: Partial<import('../../common/drama/episode-meta.js').EpisodeMetadata> = {}
      if (pipeline.causal_change_record) {
        metadataPatch.causal_change_record = pipeline.causal_change_record
      }
      const epRow = await episodesRepo.findEpisodeById(ep.id)
      const nextMetadata = Object.keys(metadataPatch).length
        ? mergeEpisodeMetadata(epRow?.metadata, metadataPatch)
        : epRow?.metadata

      await episodesRepo.updateEpisode(ep.id, {
        content: pipeline.content,
        ...(nextMetadata !== epRow?.metadata ? { metadata: nextMetadata } : {}),
        updatedAt: now(),
      })

      const checkFailed = pipeline.check != null && !pipeline.check.passed
      const checkMessage = checkFailed && pipeline.check
        ? pipeline.rewrite_attempts > 0
          ? `审校 ${pipeline.check.score} 分（已局部修正 ${pipeline.rewrite_attempts} 次仍未通过）：${pipeline.check.summary}`
          : `审校 ${pipeline.check.score} 分：${pipeline.check.summary}`
        : undefined

      if (checkFailed && !strictContinuity) {
        summary.failed += 1
        summary.errors.push({ episode_number: ep.episodeNumber, message: checkMessage! })
        logTaskError('Novel', 'batch-generate-chapter-check', {
          chapterId: ep.id,
          score: pipeline.check?.score,
          summary: pipeline.check?.summary,
        })
        onProgress({
          index,
          total: pending.length,
          episode_id: ep.id,
          episode_number: ep.episodeNumber,
          phase: progressPhase === 'check' ? 'check' : 'chapter',
          status: 'error',
          message: checkMessage,
        })
        if (stopOnError) break
      } else {
        summary.generated += 1
        onProgress({
          index,
          total: pending.length,
          episode_id: ep.id,
          episode_number: ep.episodeNumber,
          phase: pipeline.check ? 'check' : 'chapter',
          status: 'done',
        })
      }
    } catch (err: any) {
      summary.failed += 1
      const continuityAbort = isContinuityRewriteAbortError(err)
      const message = err?.message || '生成失败'
      summary.errors.push({ episode_number: ep.episodeNumber, message })
      logTaskError('Novel', 'batch-generate-chapter', {
        chapterId: ep.id,
        error: message,
        continuityAbort: continuityAbort ? err.reason : undefined,
      })
      onProgress({
        index,
        total: pending.length,
        episode_id: ep.id,
        episode_number: ep.episodeNumber,
        phase: continuityAbort ? 'rewrite' : 'chapter',
        status: 'error',
        message,
        rewrite_attempt: continuityAbort ? err.rewriteAttempts : undefined,
        check_score: continuityAbort ? err.score : undefined,
        check_summary: continuityAbort ? err.summary : undefined,
        conflicts: continuityAbort ? err.conflicts : undefined,
      })
      if (stopOnError || mustAbortBatchOnContinuityError(err)) break
    }
  }

  logTaskSuccess('Novel', 'batch-generate-chapters', { dramaId, ...summary })
  return summary
}

function formatDramaBatchError(err: unknown): string {
  return err instanceof Error ? err.message : String((err as { message?: string })?.message || err || '生成失败')
}

export async function batchGenerateDramaEpisodes(args: {
  dramaId: number
  userId: number
  userRole: string
  onProgress: ProgressFn
  shouldStop?: () => boolean
  scope?: BatchScope
}): Promise<BatchSummary> {
  const { dramaId, userId, userRole, onProgress, shouldStop, scope } = args
  await assertUserCanGenerate(userId, userRole)
  await assertUserServiceConfigReady(userId, userRole, 'text')
  if (await isHuohuoPresetEffective(userId, userRole)) {
    await assertHuohuoAgentReady(userId, userRole)
  }
  for (const serviceType of ['image', 'video', 'audio'] as const) {
    await assertUserServiceConfigReady(userId, userRole, serviceType)
  }

  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || drama.userId !== userId || drama.deletedAt || isNovelProject(drama)) {
    throw new Error('短剧项目不存在')
  }

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const pending = resolveDramaBatchTargets(episodes, scope)
  const summary: BatchSummary = { generated: 0, skipped: 0, failed: 0, errors: [] }

  if (!pending.length) return summary

  onProgress({
    index: 0,
    total: pending.length,
    episode_id: pending[0]!.id,
    episode_number: pending[0]!.episodeNumber,
    phase: 'raw',
    status: 'start',
  })

  logTaskStart('Drama', 'batch-generate-episodes', { dramaId, pending: pending.length, mode: scope?.mode ?? 'remaining' })

  let index = 0
  for (const ep of pending) {
    if (shouldStop?.()) break
    index += 1

    const emitProgress = (phase: BatchProgressPayload['phase'], status: BatchProgressPayload['status'], message?: string) => {
      onProgress({
        index,
        total: pending.length,
        episode_id: ep.id,
        episode_number: ep.episodeNumber,
        phase,
        status,
        message,
      })
    }

    try {
      await runDramaEpisodePipeline({
        episodeId: ep.id,
        drama,
        userId,
        userRole,
        overwrite: scope?.overwrite,
        productionPipeline: scope?.production_pipeline,
        shouldStop,
        onProgress: (phase, status) => emitProgress(phase, status),
      })
      summary.generated += 1
      emitProgress('merge', 'done')
    } catch (err: any) {
      if (err instanceof BatchStoppedError) break
      summary.failed += 1
      const message = formatDramaBatchError(err)
      summary.errors.push({ episode_number: ep.episodeNumber, message })
      logTaskError('Drama', 'batch-generate-episode', { episodeId: ep.id, error: message })
      emitProgress('merge', 'error', message)
    }
  }

  logTaskSuccess('Drama', 'batch-generate-episodes', { dramaId, ...summary })
  return summary
}
