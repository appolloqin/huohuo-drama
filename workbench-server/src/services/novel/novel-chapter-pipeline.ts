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
import { continuityRuleLabel } from '../../common/novel/novel-continuity-rules.js'
import { logTaskError } from '../../common/task/task-logger.js'

/** ??/?????????????????????????? UI */
function buildHardRejectContinuityCheck(
  reasons: Array<{ code: string; message: string }>,
): ContinuityCheckResult {
  const softCodes = new Set([
    'outline_endpoint_overshoot',
    'outline_boundary_model',
    'next_chapter_beat_leak',
    'chapter_event_replay',
    'draft_orphan_replay',
    'brief_pacing',
    'brief_pending_overshoot',
    'named_as_generic_epithet',
    'head_orphan_span',
    'named_as_generic',
    'opening_mid_dialogue',
    'opening_unexplained_name',
  ])
  const hardReasons = reasons.filter(r => !softCodes.has(r.code || ''))
  const use = hardReasons.length ? hardReasons : reasons
  const reasonText = use.map(r => r.message).filter(Boolean).join(';')
  return {
    passed: false,
    score: 0,
    summary: reasonText || 'outline/seam hard reject',
    conflicts: use.map(r => r.message).filter(Boolean),
    blocking_items: use.map(r => {
      const rule = r.code || 'chapter_seam_replay'
      const soft = softCodes.has(rule)
      return {
        rule,
        label: continuityRuleLabel(rule),
        message: r.message,
        layer: (soft ? 'model' : 'hard') as 'hard' | 'model',
      }
    }),
    checked_at: new Date().toISOString(),
    content_hash: hashNovelContent(`hard_reject:${reasonText}`),
  }
}

import { generateNovelChapterFull } from './novel-writing.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { preserveNovelLineLayout } from '../../common/novel/novel-paragraph-format.js'
import {
  ContinuityRewriteAbortError,
  type ContinuityAbortReason,
} from './novel-continuity-errors.js'
import { runChapterCraftPipelineHook } from './novel-chapter-craft-hook.js'
import { maybeFixChapterSeamOpening } from './novel-chapter-seam-fix.js'
import { maybeFixOutlineCompliance } from './novel-outline-compliance-fix.js'
import { alignNovelChapterOutlineBoundary } from './novel-outline-boundary.js'
import { resolveEffectiveChapterTarget } from './novel-chapter-target.js'
import { runNovelChapterAiHumanizeHook } from './novel-chapter-ai-humanize-hook.js'
import { loadPrevChapterContentTail } from './novel-continuity.js'
import { detectChapterSeamColdOpen } from './novel-chapter-seam.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import type { EpisodeAiDetection } from '../../common/drama/episode-meta.js'

async function runOutlineComplianceGate(args: {
  content: string
  dramaId: number
  chapterNumber: number
  chapterOutline?: string
  writingBrief?: string
  existingText?: string
  mode?: 'generate' | 'rewrite' | 'continue'
  targetLength?: number
  billing?: TextBillingContext
  onProgress?: (status: string) => void
}): Promise<{
  content: string
  report: import('./novel-outline-compliance-fix.js').OutlineComplianceReport
  stillCold: boolean
}> {
  const userTarget = Math.min(20000, Math.max(500, Number(args.targetLength) || 3000))
  const beatTarget = resolveEffectiveChapterTarget({
    chapterOutline: args.chapterOutline,
    userTarget,
  })
  const target = beatTarget.effectiveTarget
  const briefAlign = alignNovelChapterOutlineBoundary({
    chapterOutline: args.chapterOutline,
    writingBrief: args.writingBrief,
    existingText: args.existingText || args.content,
    mode: args.mode,
    chapterNumber: args.chapterNumber,
  })
  args.onProgress?.('正在审校大纲边界…')
  const outlineFix = await maybeFixOutlineCompliance({
    content: args.content,
    dramaId: args.dramaId,
    chapterNumber: args.chapterNumber,
    chapterOutline: args.chapterOutline,
    writingBrief: briefAlign.alignedBrief || undefined,
    existingText: args.existingText || args.content,
    billing: args.billing,
    userTarget,
    minLen: briefAlign.endpointPending ? Math.round(target * 0.82) : Math.round(target * 0.9),
    maxLen: Math.round(target * 1.12),
    onProgress: args.onProgress,
  })
  const stillCold = outlineFix.reasons.some(r => r.code === 'chapter_seam_cold_open')
  return {
    content: outlineFix.content,
    report: {
      passed: outlineFix.passed,
      attempts: outlineFix.attempts,
      reasons: outlineFix.reasons,
      hardReject: outlineFix.hardReject,
    },
    stillCold,
  }
}

export type NovelChapterPipelineResult = {
  content: string
  check: ContinuityCheckResult | null
  ledger: NovelContinuityLedger | null
  rewritten: boolean
  rewrite_attempts: number
  globalUpdated: boolean
  /** ????????????????????? metadata */
  causal_change_record?: string
  craft?: import('./novel-chapter-craft-check.js').ChapterCraftResult | null
  outline_compliance?: import('./novel-outline-compliance-fix.js').OutlineComplianceReport | null
  ai_detection?: EpisodeAiDetection | null
  hard_reject?: boolean
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
  /** ???????????/????? */
  generateArgs?: GenerateArgs
  /** ????????? SSE? */
  onProgress?: (status: string) => void
}): Promise<{
  content: string
  check: ContinuityCheckResult | null
  ledger: NovelContinuityLedger | null
  craft: import('./novel-chapter-craft-check.js').ChapterCraftResult | null
  causal_change_record?: string
  outline_compliance?: import('./novel-outline-compliance-fix.js').OutlineComplianceReport | null
  ai_detection?: EpisodeAiDetection | null
  hard_reject?: boolean
}> {
  const {
    dramaId, episodeId, chapterNumber, dramaTitle, meta, chapterOutline, billing, skipCheck,
    generateArgs, onProgress,
  } = args

  let content = args.content
  let check: ContinuityCheckResult | null = null
  let outlineCompliance: import('./novel-outline-compliance-fix.js').OutlineComplianceReport | null = null

  const runStreamContinuityCheck = async (reason: string) => {
    // ??????? rewrite ????????????????????/Craft ???????????
    if (isCausalChainEnabled(meta)) {
      onProgress?.('正在审校…')
      const ensured = await ensureCausalChangeRecordAppended({
        content,
        chapterNumber,
        billing: billing ? { ...billing, reason: `??${reason}??????` } : undefined,
      })
      content = ensured.content
    }
    let checkResult = await checkNovelChapterContinuity({
      content,
      chapterNumber,
      dramaId,
      dramaTitle,
      meta,
      chapterOutline,
      billing: billing ? { ...billing, reason: `???????${reason}` } : undefined,
    })
    if (!checkResult.passed && isOnlyCausalChangeRecordIssue(checkResult) && isCausalChainEnabled(meta)) {
      onProgress?.('正在审校…')
      const fixed = await ensureCausalChangeRecordAppended({
        content,
        chapterNumber,
        billing: billing ? { ...billing, reason: `??${reason}??????` } : undefined,
      })
      if (fixed.fixed) {
        content = fixed.content
        checkResult = await checkNovelChapterContinuity({
          content,
          chapterNumber,
          dramaId,
          dramaTitle,
          meta,
          chapterOutline,
          billing: billing ? { ...billing, reason: `???????${reason}?????????` } : undefined,
        })
      }
    }
    return checkResult
  }

  if (!skipCheck) {
    let checkResult = await runStreamContinuityCheck('')
    check = checkResult
    // ????/????????????????????????
    const seamHit = (checkResult.blocking_items || []).some(i => i.rule === 'chapter_seam_replay')
      || (checkResult.conflicts || []).some(c => /章缝回放|chapter_seam_replay/.test(c))
    if (seamHit && chapterNumber >= 2) {
      const fixed = await maybeFixChapterSeamOpening({
        content,
        dramaId,
        chapterNumber,
        chapterOutline,
        billing: billing ? { ...billing, reason: '????????' } : undefined,
      })
      if (fixed.fixed) {
        content = fixed.content
        logTaskWarn('Novel', 'post-process-seam-opening-fixed', { chapterNumber })
        checkResult = await runStreamContinuityCheck('???????')
        check = checkResult
      }
    }
    await saveContinuityCheck(episodeId, check)
  }

  // ?????? Craft?????????????/????
  const prevTail = chapterNumber >= 2
    ? await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
    : ''
  {
    const gate = await runOutlineComplianceGate({
      content,
      dramaId,
      chapterNumber,
      chapterOutline,
      writingBrief: generateArgs?.prompt,
      existingText: content,
      mode: generateArgs?.mode || 'rewrite',
      targetLength: generateArgs?.targetLength,
      billing,
      onProgress,
    })
    content = gate.content
    outlineCompliance = gate.report
    // ?????????????????????? Craft/????????? UI ???? reasons
    if (gate.report.hardReject) {
      logTaskWarn('Novel', 'post-process-outline-hard-reject', {
        chapterNumber,
        codes: gate.report.reasons.map(r => r.code),
        chars: [...(args.content || '')].length,
      })
      if (!skipCheck) {
        check = buildHardRejectContinuityCheck(gate.report.reasons)
        await saveContinuityCheck(episodeId, check)
      }
      return {
        // ???????????????????????????
        content: '',
        check,
        ledger: null,
        craft: null,
        outline_compliance: outlineCompliance,
        ai_detection: null,
        hard_reject: true,
      }
    }
  }

  let craft: import('./novel-chapter-craft-check.js').ChapterCraftResult | null = null
  if (generateArgs) {
    const { loadPrevChapterEndSnapshot } = await import('./novel-chapter-end-snapshot.js')
    const prevSnapshot = chapterNumber >= 2
      ? await loadPrevChapterEndSnapshot(dramaId, chapterNumber)
      : null
    const blockStructureRewrite = !!outlineCompliance?.reasons.some(
      r => r.code === 'chapter_seam_cold_open',
    )
    const beforeCraft = content
    const craftOut = await runChapterCraftPipelineHook({
      content,
      generateArgs: { ...generateArgs, existingText: content, mode: 'rewrite' },
      dramaId,
      episodeId,
      chapterNumber,
      dramaTitle,
      meta,
      chapterOutline,
      billing,
      prevChapterTail: prevTail,
      prevSnapshot,
      blockStructureRewrite,
    })
    content = craftOut.content
    craft = craftOut.craft
    // Craft ???????????????????
    if (chapterNumber >= 2 && craftOut.rewritten) {
      const { detectChapterSeamReplay } = await import('./novel-chapter-seam.js')
      const after = detectChapterSeamReplay({
        content,
        chapterNumber,
        prevChapterTail: prevTail,
        chapterOutline,
        prevSnapshot,
      })
      const beforeHit = detectChapterSeamReplay({
        content: beforeCraft,
        chapterNumber,
        prevChapterTail: prevTail,
        chapterOutline,
        prevSnapshot,
      })
      if (after && !beforeHit) {
        logTaskWarn('Novel', 'craft-reverted-seam-replay', { chapterNumber })
        content = beforeCraft
      }
    }
  }

  // ? AI ?????????????????????
  let aiDetection: EpisodeAiDetection | null = null
  {
    const beforeHumanize = content
    const beforeCold = chapterNumber >= 2 && !!detectChapterSeamColdOpen({
      content: beforeHumanize,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    const humanizeOut = await runNovelChapterAiHumanizeHook({
      content,
      episodeId,
      chapterNumber,
      meta,
      billing,
      onProgress,
    })
    const afterCold = chapterNumber >= 2 && !!detectChapterSeamColdOpen({
      content: humanizeOut.content,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    if (afterCold && !beforeCold) {
      logTaskWarn('Novel', 'humanize-reverted-cold-open', { chapterNumber })
      content = beforeHumanize
      aiDetection = humanizeOut.ai_detection
    } else {
      content = humanizeOut.content
      aiDetection = humanizeOut.ai_detection
    }
  }

  if (
    chapterNumber >= 2
    && detectChapterSeamColdOpen({
      content,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
  ) {
    logTaskWarn('Novel', 'post-process-outline-recheck-after-style', { chapterNumber })
    const gate = await runOutlineComplianceGate({
      content,
      dramaId,
      chapterNumber,
      chapterOutline,
      writingBrief: generateArgs?.prompt,
      existingText: content,
      mode: 'rewrite',
      targetLength: generateArgs?.targetLength,
      billing,
      onProgress,
    })
    content = gate.content
    outlineCompliance = {
      passed: gate.report.passed,
      attempts: (outlineCompliance?.attempts || 0) + gate.report.attempts,
      reasons: gate.report.reasons,
      hardReject: gate.report.hardReject,
    }
    if (gate.report.hardReject) {
      logTaskWarn('Novel', 'post-process-outline-hard-reject-after-style', {
        chapterNumber,
        codes: gate.report.reasons.map(r => r.code),
      })
      if (!skipCheck) {
        check = buildHardRejectContinuityCheck(gate.report.reasons)
        await saveContinuityCheck(episodeId, check)
      }
      return {
        content: '',
        check,
        ledger: null,
        craft,
        outline_compliance: outlineCompliance,
        ai_detection: aiDetection,
        hard_reject: true,
      }
    }
  }

  // Craft/?????????????????????????????
  if (!skipCheck && isCausalChainEnabled(meta)) {
    const afterHooks = await runStreamContinuityCheck('???/????')
    check = afterHooks
    await saveContinuityCheck(episodeId, check)
  } else if (isCausalChainEnabled(meta)) {
    const ensured = await ensureCausalChangeRecordAppended({
      content,
      chapterNumber,
      billing: billing ? { ...billing, reason: '??????????' } : undefined,
    })
    content = ensured.content
  }

  let ledger: NovelContinuityLedger | null = null
  try {
    const prose = await applyNovelMemoryFromChapter({
      dramaId, chapterNumber, content, meta,
      billing: billing ? { ...billing, reason: '?????/????' } : undefined,
    })
    content = prose
    const fin = await finalizeChapterContinuity({
      dramaId,
      episodeId,
      chapterNumber,
      content: prose,
      dramaTitle,
      billing: billing ? { ...billing, reason: '?????????' } : undefined,
    })
    ledger = fin.ledger
  } catch (err: any) {
    logTaskError('Novel', 'continuity-finalize', {
      chapterId: episodeId,
      error: err?.message || '??????',
    })
  }

  let causalChangeRecord: string | undefined
  if (isCausalChainEnabled(meta)) {
    const detached = detachChangeRecordForStorage(content)
    if (detached.changeBlock) {
      content = detached.prose
      causalChangeRecord = detached.changeBlock
      const ep = await episodesRepo.findEpisodeById(episodeId)
      const metadata = mergeEpisodeMetadata(ep?.metadata, {
        causal_change_record: causalChangeRecord,
      })
      await episodesRepo.updateEpisode(episodeId, { metadata, updatedAt: now() })
    }
  }

  content = normalizeNovelTemporalNumerals(preserveNovelLineLayout('', content))
  return {
    content,
    check,
    ledger,
    craft,
    causal_change_record: causalChangeRecord,
    outline_compliance: outlineCompliance,
    ai_detection: aiDetection,
  }
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
  /** ??????????????????? meta.continuity_strict */
  strictContinuity?: boolean
  /** ?????????null/0 ??????????? */
  maxRewriteAttempts?: number
  skipCheck?: boolean
  skipFinalize?: boolean
  skipFinalizeWhenCheckFails?: boolean
  shouldStop?: () => boolean
  onPhase?: (phase: 'chapter' | 'check' | 'rewrite', detail?: Record<string, unknown>) => void
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
    if (shouldStop?.()) throw new Error('???????????')
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
    await maybeEnsureChangeRecord(`?????????${reasonSuffix}`)
    onPhase?.('check')
    assertNotStopped()
    const reason = `???????${reasonSuffix}`
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

      // ?????????????? + ???????? regen/patch
      if (isOnlyCausalChangeRecordIssue(checkResult)) {
        const before = hashNovelContent(content.trim())
        const fixed = await maybeEnsureChangeRecord('??????????????')
        if (fixed) {
          checkResult = await runCheck('?????????')
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
            ? { ...billing, reason: `????????????${rewriteAttempts}??` }
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
            ? { ...billing, reason: `???????????${rewriteAttempts}??` }
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

      checkResult = await runCheck(`??${rewriteAttempts}?????`)
    }
    check = checkResult
  }

  // ?????? Craft???? postProcess ???
  const prevTailBatch = chapterNumber >= 2
    ? await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
    : ''
  let outlineCompliance: import('./novel-outline-compliance-fix.js').OutlineComplianceReport | null = null
  {
    const gate = await runOutlineComplianceGate({
      content,
      dramaId,
      chapterNumber,
      chapterOutline,
      writingBrief: generateArgs?.prompt,
      existingText: content,
      mode: generateArgs?.mode || 'rewrite',
      targetLength: generateArgs?.targetLength,
      billing,
    })
    content = gate.content
    outlineCompliance = gate.report
    if (!gate.report.passed || gate.report.attempts > 0) {
      rewritten = true
      rewriteAttempts += gate.report.attempts
    }
    if (gate.report.hardReject) {
      logTaskWarn('Novel', 'pipeline-outline-hard-reject', {
        chapterNumber,
        codes: gate.report.reasons.map(r => r.code),
      })
      return {
        content: '',
        check,
        ledger: null,
        rewritten,
        rewrite_attempts: rewriteAttempts,
        globalUpdated: false,
        craft: null,
        outline_compliance: outlineCompliance,
        ai_detection: null,
        hard_reject: true,
      }
    }
  }

  let craft: import('./novel-chapter-craft-check.js').ChapterCraftResult | null = null
  try {
    const { loadPrevChapterEndSnapshot } = await import('./novel-chapter-end-snapshot.js')
    const prevSnapshotBatch = chapterNumber >= 2
      ? await loadPrevChapterEndSnapshot(dramaId, chapterNumber)
      : null
    const blockStructureRewrite = !!outlineCompliance?.reasons.some(
      r => r.code === 'chapter_seam_cold_open',
    )
    const beforeCraftBatch = content
    const craftOut = await runChapterCraftPipelineHook({
      content,
      generateArgs: { ...generateArgs, existingText: content, mode: 'rewrite' },
      dramaId,
      episodeId,
      chapterNumber,
      dramaTitle,
      meta,
      chapterOutline,
      billing,
      shouldStop,
      prevChapterTail: prevTailBatch,
      prevSnapshot: prevSnapshotBatch,
      blockStructureRewrite,
      onPhase: (phase, detail) => {
        if (phase === 'check') onPhase?.('check', detail)
        if (phase === 'rewrite') onPhase?.('rewrite', detail)
      },
    })
    content = craftOut.content
    craft = craftOut.craft
    if (chapterNumber >= 2 && craftOut.rewritten) {
      const { detectChapterSeamReplay } = await import('./novel-chapter-seam.js')
      const after = detectChapterSeamReplay({
        content,
        chapterNumber,
        prevChapterTail: prevTailBatch,
        chapterOutline,
        prevSnapshot: prevSnapshotBatch,
      })
      const beforeHit = detectChapterSeamReplay({
        content: beforeCraftBatch,
        chapterNumber,
        prevChapterTail: prevTailBatch,
        chapterOutline,
        prevSnapshot: prevSnapshotBatch,
      })
      if (after && !beforeHit) {
        logTaskWarn('Novel', 'craft-reverted-seam-replay', { chapterNumber })
        content = beforeCraftBatch
      }
    }
    if (craftOut.rewritten) {
      rewritten = true
      rewriteAttempts += craftOut.rewriteAttempts
    }
  } catch (err) {
    throw err
  }

  let aiDetection: EpisodeAiDetection | null = null
  {
    const beforeHumanize = content
    const beforeCold = chapterNumber >= 2 && !!detectChapterSeamColdOpen({
      content: beforeHumanize,
      chapterNumber,
      prevChapterTail: prevTailBatch,
      chapterOutline,
    })
    const humanizeOut = await runNovelChapterAiHumanizeHook({
      content,
      episodeId,
      chapterNumber,
      meta,
      billing,
      onProgress: (status) => onPhase?.('rewrite', { status, humanize: true }),
    })
    const afterCold = chapterNumber >= 2 && !!detectChapterSeamColdOpen({
      content: humanizeOut.content,
      chapterNumber,
      prevChapterTail: prevTailBatch,
      chapterOutline,
    })
    if (afterCold && !beforeCold) {
      logTaskWarn('Novel', 'humanize-reverted-cold-open', { chapterNumber })
      content = beforeHumanize
      aiDetection = humanizeOut.ai_detection
    } else {
      content = humanizeOut.content
      aiDetection = humanizeOut.ai_detection
      if (humanizeOut.humanize_attempts > 0) rewritten = true
    }
  }

  if (
    chapterNumber >= 2
    && detectChapterSeamColdOpen({
      content,
      chapterNumber,
      prevChapterTail: prevTailBatch,
      chapterOutline,
    })
  ) {
    logTaskWarn('Novel', 'pipeline-outline-recheck-after-style', { chapterNumber })
    const gate = await runOutlineComplianceGate({
      content,
      dramaId,
      chapterNumber,
      chapterOutline,
      writingBrief: generateArgs?.prompt,
      existingText: content,
      mode: 'rewrite',
      targetLength: generateArgs?.targetLength,
      billing,
    })
    content = gate.content
    outlineCompliance = {
      passed: gate.report.passed,
      attempts: (outlineCompliance?.attempts || 0) + gate.report.attempts,
      reasons: gate.report.reasons,
    }
    if (!gate.report.passed || gate.report.attempts > 0) rewritten = true
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
    billing: billing ? { ...billing, reason: '?????/????' } : undefined,
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
          ? { ...billing, reason: '?????????' }
          : undefined,
      })
      ledger = fin.ledger
      globalUpdated = fin.globalUpdated
    } catch (err: any) {
      logTaskError('Novel', 'continuity-finalize', {
        chapterId: episodeId,
        error: err?.message || '??????',
      })
    }
    if (isCausalChainEnabled(meta)) {
      try {
        await updateCausalChainFromChapter({
          dramaId,
          chapterNumber,
          fullContent: content,
          dramaTitle,
          billing: billing ? { ...billing, reason: '?????' } : undefined,
        })
      } catch (err: any) {
        logTaskError('Novel', 'causal-chain-update', {
          chapterId: episodeId,
          error: err?.message || '???????',
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
    outline_compliance: outlineCompliance,
    craft,
    ai_detection: aiDetection,
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

/** ???????????? metadata?????? */
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
    billing: args.billing ? { ...args.billing, reason: '???????' } : undefined,
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
