import type { TextBillingContext } from '../ai/ai.js'
import {
  checkNovelChapterContinuity,
  buildContinuityFixPrompt,
  formatCheckProgressHints,
} from './novel-continuity-check.js'
import { patchNovelChapterContinuity } from './novel-continuity-patch.js'
import { finalizeChapterContinuity } from './novel-continuity.js'
import { applyNovelMemoryFromChapter } from './novel-memory/index.js'
import {
  updateCausalChainFromChapter,
  isCausalChainEnabled,
  detachChangeRecordForStorage,
  ensureCausalChangeRecordAppended,
  needsCausalChangeRecordFix,
  isOnlyCausalChangeRecordIssue,
  resolveFullChapterForAudit,
} from './novel-causal-chain/index.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import { mergeEpisodeMetadata, parseEpisodeMetadata } from '../../common/drama/episode-meta.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../../common/http/response.js'
import type { NovelMetadata } from '../../common/novel/novel-meta.js'
import { resolveContinuityRewriteMax, resolveContinuityStagnantStreak } from '../../common/novel/novel-meta.js'
import type { NovelContinuityLedger } from '../../common/novel/novel-continuity-state.js'
import type { ContinuityCheckResult, ContinuityRewriteLogEntry } from '../../common/novel/novel-continuity-state.js'
import { logTaskError } from '../../common/task/task-logger.js'
import { generateNovelChapterFull } from './novel-writing.js'
import {
  ContinuityRewriteAbortError,
  type ContinuityAbortReason,
} from './novel-continuity-errors.js'

export type NovelChapterPipelineResult = {
  content: string
  check: ContinuityCheckResult | null
  ledger: NovelContinuityLedger | null
  rewritten: boolean
  rewrite_attempts: number
  globalUpdated: boolean
  /** 因果链模式：从正文拆出的【变更记录】，落库 metadata */
  causal_change_record?: string
}

type GenerateArgs = Parameters<typeof generateNovelChapterFull>[0]

export async function postProcessNovelChapterContent(args: {
  content: string
  dramaId: number
  episodeId: number
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  chapterOutline?: string
  billing?: TextBillingContext
  skipCheck?: boolean
}): Promise<{ check: ContinuityCheckResult | null; ledger: NovelContinuityLedger | null }> {
  const {
    content, dramaId, episodeId, chapterNumber, dramaTitle, meta, chapterOutline, billing, skipCheck,
  } = args

  let check: ContinuityCheckResult | null = null
  if (!skipCheck) {
    const checkResult = await checkNovelChapterContinuity({
      content,
      chapterNumber,
      dramaId,
      dramaTitle,
      meta,
      chapterOutline,
      billing: billing ? { ...billing, reason: '小说一致性审校' } : undefined,
    })
    check = checkResult
    await saveContinuityCheck(episodeId, checkResult)
  }

  let ledger: NovelContinuityLedger | null = null
  try {
    const prose = await applyNovelMemoryFromChapter({
      dramaId, chapterNumber, content, meta,
      billing: billing ? { ...billing, reason: '小说长记忆/锚点回写' } : undefined,
    })
    const fin = await finalizeChapterContinuity({
      dramaId,
      episodeId,
      chapterNumber,
      content: prose,
      dramaTitle,
      billing: billing ? { ...billing, reason: '小说一致性账本提取' } : undefined,
    })
    ledger = fin.ledger
  } catch (err: any) {
    logTaskError('Novel', 'continuity-finalize', {
      chapterId: episodeId,
      error: err?.message || '账本提取失败',
    })
  }

  return { check, ledger }
}

export async function runNovelChapterPipeline(args: {
  generateArgs: GenerateArgs
  dramaId: number
  episodeId: number
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  chapterOutline?: string
  billing?: TextBillingContext
  /** 审校未通过时循环修正直至通过，默认跟随 meta.continuity_strict */
  strictContinuity?: boolean
  /** 单章最大修正轮次；null/0 表示不限制，默认不限制 */
  maxRewriteAttempts?: number
  skipCheck?: boolean
  skipFinalize?: boolean
  skipFinalizeWhenCheckFails?: boolean
  shouldStop?: () => boolean
  onPhase?: (phase: 'chapter' | 'check' | 'rewrite', detail?: {
    rewriteAttempt?: number
    conflicts?: string[]
    blocking_items?: import('../../common/novel/novel-continuity-rules.js').ContinuityBlockingItem[]
    score?: number
    summary?: string
    rule_hints?: string[]
    model_rejected?: string[]
    mode?: 'patch' | 'regen'
  }) => void
}): Promise<NovelChapterPipelineResult> {
  const {
    generateArgs,
    dramaId,
    episodeId,
    chapterNumber,
    dramaTitle,
    meta,
    chapterOutline,
    billing,
    strictContinuity = meta.continuity_strict !== false,
    maxRewriteAttempts,
    skipCheck = false,
    skipFinalize = false,
    skipFinalizeWhenCheckFails = false,
    shouldStop,
    onPhase,
  } = args

  const rewriteMax = resolveContinuityRewriteMax(meta, maxRewriteAttempts)
  const stagnantLimit = resolveContinuityStagnantStreak(meta)

  const assertNotStopped = () => {
    if (shouldStop?.()) throw new Error('用户已请求停止批量撰写')
  }

  onPhase?.('chapter')
  assertNotStopped()
  let content = await generateNovelChapterFull(generateArgs, billing)
  let rewritten = false
  let rewriteAttempts = 0
  let check: ContinuityCheckResult | null = null
  let patchStagnant = 0
  let stagnantRewrites = 0
  let rejectedIssueStreak = 0
  let lastRejectedFingerprint = ''
  const rewriteLog: ContinuityRewriteLogEntry[] = []

  const rejectedFingerprint = (check: ContinuityCheckResult): string => {
    const items = (check.audit?.model_rejected ?? []).slice(0, 2).map(r => r.replace(/\s+/g, ' ').trim())
    return items.join('|')
  }

  const continuityRewriteDetail = (result: ContinuityCheckResult, extra: {
    rewriteAttempt?: number
    mode?: 'patch' | 'regen' | 'ensure_record'
  } = {}) => ({
    rewriteAttempt: extra.rewriteAttempt,
    conflicts: result.conflicts,
    blocking_items: result.blocking_items,
    score: result.score,
    summary: result.summary,
    mode: extra.mode === 'ensure_record' ? 'patch' : extra.mode,
    ...formatCheckProgressHints(result),
  })

  const abortContinuity = (
    reason: ContinuityAbortReason,
    result: ContinuityCheckResult,
    extra?: { rewriteMax?: number; sameIssueStreak?: number },
  ) => {
    onPhase?.('rewrite', continuityRewriteDetail(result, { rewriteAttempt: rewriteAttempts, mode: 'regen' }))
    throw new ContinuityRewriteAbortError({
      chapterNumber,
      rewriteAttempts,
      score: result.score,
      conflicts: result.conflicts,
      summary: result.summary,
      reason,
      rewriteMax: extra?.rewriteMax ?? rewriteMax ?? undefined,
      sameIssueStreak: extra?.sameIssueStreak,
    })
  }

  const maybeEnsureChangeRecord = async (reason: string): Promise<boolean> => {
    if (!isCausalChainEnabled(meta)) return false
    const ensured = await ensureCausalChangeRecordAppended({
      content,
      chapterNumber,
      billing: billing ? { ...billing, reason } : undefined,
    })
    content = ensured.content
    return ensured.fixed
  }

  const runCheck = async (reasonSuffix = '') => {
    await maybeEnsureChangeRecord(`审校前补全变更记录${reasonSuffix}`)
    onPhase?.('check')
    assertNotStopped()
    const reason = `小说一致性审校${reasonSuffix}`
    const checkResult = await checkNovelChapterContinuity({
      content,
      chapterNumber,
      dramaId,
      dramaTitle,
      meta,
      chapterOutline,
      billing: billing ? { ...billing, reason } : undefined,
    })
    await saveContinuityCheck(episodeId, checkResult)
    return checkResult
  }

  if (!skipCheck) {
    let checkResult = await runCheck()

    while (strictContinuity && !checkResult.passed) {
      if (rewriteMax != null && rewriteAttempts >= rewriteMax) {
        abortContinuity('max_attempts', checkResult, { rewriteMax })
      }

      // 仅缺【变更记录】：程序化补全 + 重审，不计入整章 regen/patch
      if (isOnlyCausalChangeRecordIssue(checkResult)) {
        const before = hashNovelContent(content.trim())
        const fixed = await maybeEnsureChangeRecord('仅补全变更记录（免整章重写）')
        if (fixed) {
          checkResult = await runCheck('（变更记录补全后）')
          stagnantRewrites = 0
          continue
        }
        if (hashNovelContent(content.trim()) === before) {
          stagnantRewrites += 1
          if (stagnantRewrites >= stagnantLimit) {
            abortContinuity('stagnant_rewrite', checkResult, { sameIssueStreak: stagnantLimit })
          }
        }
      }

      rewriteAttempts += 1

      const conflicts = checkResult.conflicts
      const hasHard = (checkResult.audit?.hard.length ?? 0) > 0
      const hasModel = (checkResult.audit?.model.length ?? 0) > 0
      const rejectedFp = rejectedFingerprint(checkResult)
      if (rejectedFp && rejectedFp === lastRejectedFingerprint) {
        rejectedIssueStreak += 1
      } else if (rejectedFp) {
        lastRejectedFingerprint = rejectedFp
        rejectedIssueStreak = 1
      } else {
        rejectedIssueStreak = 0
        lastRejectedFingerprint = ''
      }
      const plotModelConflicts = (checkResult.audit?.model ?? []).filter(m =>
        /吃书|场景|逻辑|剧情|须立即|下章|顺绳|溪边|踪迹|锁定事实|黑松林|断崖|绳索|发现.*踪迹/.test(m.message),
      )
      const rejectedPlotHints = (checkResult.audit?.model_rejected ?? []).filter(r =>
        /吃书|状态矛盾|矛盾|不一致|【因果起点】/.test(r),
      )
      const needsStructuralFix = plotModelConflicts.length > 0 || rejectedPlotHints.length > 0
      const lastMode = rewriteLog.at(-1)?.mode
      const needsChangeRecord = needsCausalChangeRecordFix(checkResult)
      const useRegen = needsChangeRecord
        || !conflicts.length
        || rejectedPlotHints.length > 0
        || patchStagnant >= 2
        || rejectedIssueStreak >= 2
        || (needsStructuralFix && rewriteAttempts <= 1)
        || (needsStructuralFix && lastMode === 'patch')
        || (hasHard && lastMode === 'patch')
        || (hasHard && patchStagnant >= 1)
        || (hasModel && !hasHard && patchStagnant >= 2)
      const mode: 'patch' | 'regen' = (needsChangeRecord || useRegen) ? 'regen' : 'patch'

      onPhase?.('rewrite', continuityRewriteDetail(checkResult, { rewriteAttempt: rewriteAttempts, mode }))
      assertNotStopped()

      const prevContent = content
      const prevHash = hashNovelContent(prevContent.trim())
      if (mode === 'regen') {
        const fixedPrompt = buildContinuityFixPrompt(generateArgs.prompt, checkResult, rewriteLog)
        content = await generateNovelChapterFull(
          { ...generateArgs, prompt: fixedPrompt },
          billing
            ? { ...billing, reason: `小说章节一致性重生成（第${rewriteAttempts}次）` }
            : undefined,
        )
        rewritten = true
        patchStagnant = 0
      } else {
        content = await patchNovelChapterContinuity({
          content,
          check: checkResult,
          chapterNumber,
          dramaId,
          dramaTitle,
          attemptHistory: rewriteLog,
          billing: billing
            ? { ...billing, reason: `小说一致性局部修正（第${rewriteAttempts}次）` }
            : undefined,
        })

        if (content !== prevContent) {
          rewritten = true
          patchStagnant = 0
        } else {
          patchStagnant += 1
        }
      }

      const afterHash = hashNovelContent(content.trim())
      if (afterHash === prevHash) {
        stagnantRewrites += 1
        if (stagnantRewrites >= stagnantLimit) {
          abortContinuity('stagnant_rewrite', checkResult, { sameIssueStreak: stagnantLimit })
        }
      } else {
        stagnantRewrites = 0
      }

      rewriteLog.push({
        attempt: rewriteAttempts,
        score: checkResult.score,
        conflicts: [...checkResult.conflicts],
        blocking_items: checkResult.blocking_items?.length ? [...checkResult.blocking_items] : undefined,
        summary: checkResult.summary,
        patch_changed: content !== prevContent,
        mode,
        at: new Date().toISOString(),
      })
      await saveContinuityRewriteLog(episodeId, rewriteLog)

      checkResult = await runCheck(`（第${rewriteAttempts}次修正后）`)
    }
    check = checkResult
  }

  let ledger: NovelContinuityLedger | null = null
  let globalUpdated = false

  const checkFailed = check != null && !check.passed
  const shouldFinalize = !skipFinalize && !(skipFinalizeWhenCheckFails && checkFailed)

  content = await applyNovelMemoryFromChapter({
    dramaId,
    chapterNumber,
    content,
    meta,
    billing: billing ? { ...billing, reason: '小说长记忆/锚点回写' } : undefined,
  })

  if (shouldFinalize) {
    try {
      const fin = await finalizeChapterContinuity({
        dramaId,
        episodeId,
        chapterNumber,
        content,
        dramaTitle,
        billing: billing
          ? { ...billing, reason: '小说一致性账本提取' }
          : undefined,
      })
      ledger = fin.ledger
      globalUpdated = fin.globalUpdated
    } catch (err: any) {
      logTaskError('Novel', 'continuity-finalize', {
        chapterId: episodeId,
        error: err?.message || '账本提取失败',
      })
    }
    if (isCausalChainEnabled(meta)) {
      try {
        await updateCausalChainFromChapter({
          dramaId,
          chapterNumber,
          fullContent: content,
          dramaTitle,
          billing: billing ? { ...billing, reason: '因果链更新' } : undefined,
        })
      } catch (err: any) {
        logTaskError('Novel', 'causal-chain-update', {
          chapterId: episodeId,
          error: err?.message || '因果链更新失败',
        })
      }
    }
  }

  let causalChangeRecord: string | undefined
  if (isCausalChainEnabled(meta)) {
    const detached = detachChangeRecordForStorage(content)
    if (detached.changeBlock) {
      content = detached.prose
      causalChangeRecord = detached.changeBlock
    }
  }

  return {
    content,
    check,
    ledger,
    rewritten,
    rewrite_attempts: rewriteAttempts,
    globalUpdated,
    causal_change_record: causalChangeRecord,
  }
}

async function saveContinuityRewriteLog(episodeId: number, log: ContinuityRewriteLogEntry[]) {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  const metadata = mergeEpisodeMetadata(ep?.metadata, { continuity_rewrite_log: log })
  await episodesRepo.updateEpisode(episodeId, { metadata, updatedAt: now() })
}

async function saveContinuityCheck(episodeId: number, check: ContinuityCheckResult) {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  const metadata = mergeEpisodeMetadata(ep?.metadata, { continuity_check: check })
  await episodesRepo.updateEpisode(episodeId, { metadata, updatedAt: now() })
}

/** 续写等路径：仅审校并写入 metadata，不提取账本 */
export async function checkAndSaveChapterContinuity(args: {
  content: string
  dramaId: number
  episodeId: number
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  chapterOutline?: string
  billing?: TextBillingContext
}): Promise<ContinuityCheckResult> {
  const ep = await episodesRepo.findEpisodeById(args.episodeId)
  const epMeta = parseEpisodeMetadata(ep?.metadata)
  const auditContent = resolveFullChapterForAudit(args.content, epMeta.causal_change_record)

  const check = await checkNovelChapterContinuity({
    ...args,
    content: auditContent,
    billing: args.billing ? { ...args.billing, reason: '小说一致性审校' } : undefined,
  })
  await saveContinuityCheck(args.episodeId, check)
  return check
}

export function refreshNovelChapterContinuityIfNeeded(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  content: string
  dramaTitle?: string
  billing?: TextBillingContext
  force?: boolean
}) {
  return finalizeChapterContinuity({
    ...args,
    skipIfUnchanged: !args.force,
  })
}
