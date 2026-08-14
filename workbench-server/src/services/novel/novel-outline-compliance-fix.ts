/**
 * ????????? ? ?????? ? ???
 * ??/?????????????minLen?maxLen??
 * ??????????????????
 * ???????????????????????????????????
 */
import { chatCompletionText, sanitizeModelCreativeOutput, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { polishNovelChapterProse } from './novel-prose-polish.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { loadNextChapterContentHead, loadPrevChapterContentTail } from './novel-continuity.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  buildOutlineComplianceFixPrompt,
  detectOutlineCompliance,
  outlineBeatCoveredIn,
  type OutlineComplianceReason,
} from './novel-outline-compliance.js'
import { auditOutlineBoundaryWithModel } from './novel-outline-boundary-audit.js'
import { isUsableNovelCreativeOutput } from '../../common/novel/novel-creative-output.js'
import {
  alignNovelChapterOutlineBoundary,
  buildOutlineOnlyWritingStub,
} from './novel-outline-boundary.js'
import { resolveEffectiveChapterTarget } from './novel-chapter-target.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { extractChapterOutline } from '../../common/novel/novel-outline.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import { parseNovelMetadata } from '../../common/novel/novel-meta.js'
import { extractOutlineBeatPhrases } from './novel-chapter-seam.js'
import { filterDraftByChapterOutline } from './novel-draft-outline-filter.js'
import { stripOutlinePoisonProse } from './novel-outline-poison-strip.js'

/** ??????????????????????? */
export const OUTLINE_COMPLIANCE_MAX_ROUNDS = 3

export type OutlineComplianceReport = {
  passed: boolean
  attempts: number
  reasons: OutlineComplianceReason[]
  /** ????????????????? reasons ?? UI */
  hardReject?: boolean
}

export type OutlineComplianceFixResult = {
  content: string
  fixed: boolean
  passed: boolean
  attempts: number
  reasons: OutlineComplianceReason[]
  hardReject?: boolean
}

/** @deprecated ????????????????????????? */
export class OutlineComplianceHardFailError extends Error {
  readonly chapterNumber: number
  readonly reasons: OutlineComplianceReason[]

  constructor(chapterNumber: number, reasons: OutlineComplianceReason[]) {
    const brief = reasons.map(r => r.message).slice(0, 2).join('?')
    super(
      `? ${chapterNumber} ???????????????????????????????????/??????????????${brief ? ` ${brief}` : ''}`,
    )
    this.name = 'OutlineComplianceHardFailError'
    this.chapterNumber = chapterNumber
    this.reasons = reasons
  }
}

export function isOutlineComplianceHardFailError(err: unknown): err is OutlineComplianceHardFailError {
  return err instanceof OutlineComplianceHardFailError
}

async function loadNextChapterOutline(dramaId: number, chapterNumber: number): Promise<string> {
  try {
    const next = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, chapterNumber + 1)
    const fromEp = next?.description?.trim()
    if (fromEp) return fromEp
    const drama = await dramasRepo.findDramaById(dramaId)
    const meta = parseNovelMetadata(drama?.metadata)
    return extractChapterOutline(meta.outline || '', chapterNumber + 1).trim()
  } catch {
    return ''
  }
}

/** ??????????????????????????? */
function scoreOutlineCandidate(args: {
  text: string
  chapterOutline?: string
  writingBrief?: string
  existingText?: string
  prevChapterTail?: string
  nextChapterOutline?: string
  nextChapterHead?: string
  chapterNumber: number
}): number {
  const check = detectOutlineCompliance({
    content: args.text,
    chapterOutline: args.chapterOutline,
    writingBrief: args.writingBrief,
    existingText: args.existingText,
    prevChapterTail: args.prevChapterTail,
    nextChapterOutline: args.nextChapterOutline,
    nextChapterHead: args.nextChapterHead,
    chapterNumber: args.chapterNumber,
  })
  if (check.ok) return 10_000
  let score = 500 - check.reasons.length * 40
  const hard = new Set([
    'early_beats_missing',
    'chapter_seam_cold_open',
    'next_chapter_beat_leak',
    'outline_endpoint_overshoot',
    'outline_boundary_model',
    'head_orphan_span',
  ])
  // overshoot / leak 权重提高，促使修写优先砍掉下章结果态
  for (const r of check.reasons) {
    if (r.code === 'chapter_seam_cold_open') score -= 160
    else if (r.code === 'outline_endpoint_overshoot' || r.code === 'next_chapter_beat_leak') score -= 140
    else if (hard.has(r.code)) score -= 80
    else if (
      r.code === 'chapter_event_replay'
      || r.code === 'draft_orphan_replay'
      || r.code === 'catalyst_agency_fail'
      || r.code === 'chapter_forward_seam_copy'
    ) score -= 25
  }
  const beats = extractOutlineBeatPhrases(args.chapterOutline || '').filter(b => [...b].length >= 6)
  if (beats.length) {
    const hits = beats.filter(b => outlineBeatCoveredIn(args.text, b)).length
    score += hits * 35
  }
  return score
}

async function rewriteOnceForOutline(args: {
  content: string
  reasons: OutlineComplianceReason[]
  chapterOutline?: string
  writingBrief?: string
  orphanDraftExcerpt?: string
  nextChapterOutline?: string
  nextChapterHead?: string
  prevChapterTail?: string
  chapterNumber: number
  billing?: TextBillingContext
  minLen: number
  maxLen: number
  nuclearCold?: boolean
}): Promise<string | null> {
  const {
    content, reasons, chapterOutline, writingBrief, orphanDraftExcerpt, nextChapterOutline,
    nextChapterHead, prevChapterTail, chapterNumber, billing, minLen, maxLen, nuclearCold,
  } = args

  const user = buildOutlineComplianceFixPrompt({
    content,
    reasons,
    chapterOutline,
    writingBrief,
    orphanDraftExcerpt,
    nextChapterOutline,
    nextChapterHead,
    prevChapterTail,
    chapterNumber,
    nuclearCold,
  })
  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    nuclearCold
      ? `?????? ${chapterNumber} ?????????????????????????+?????????`
      : `??????????????? ${chapterNumber} ??????????????`,
    '**??**?????????????????????????????????**?????????????**??????????/?+??????????????????',
    '**????**???????????????????????????????????????????',
    nuclearCold
      ? '**????**???????????????????????????????????1?'
      : '',
    `**????**?????? ${minLen}?${maxLen} ????????????????????????????????????????????????????`,
    '????????????????????????????????????',
  ].filter(Boolean).join('\n')

  const options = await novelAgentCompletionOptions('novel_chapter_writer', {
    maxTokens: 8192,
    temperature: 0.7,
  })
  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      ...options,
      billing: billing
        ? { ...billing, reason: `??????????${chapterNumber}??` }
        : undefined,
    },
  )
  const draft = sanitizeModelCreativeOutput(raw)
  if (!isUsableNovelCreativeOutput(draft, 'chapter_prose')) return null

  let fixed = normalizeNovelTemporalNumerals(draft)
  const coldFix = reasons.some(r => r.code === 'chapter_seam_cold_open')
    || !!nuclearCold
  // ?????????????? ~0.88 ?????????????????????
  const softMin = Math.round(minLen * (coldFix ? 0.72 : 0.97))
  const preN = countNovelChars(fixed)

  // ???/?????????????????????????????
  if (coldFix) {
    if (preN < softMin) {
      logTaskWarn('Novel', 'outline-compliance-cold-skip-polish-short', {
        chapterNumber,
        preN,
        softMin,
        nuclearCold: !!nuclearCold,
      })
      return null
    }
    logTaskWarn('Novel', 'outline-compliance-cold-skip-polish', {
      chapterNumber,
      chars: preN,
      nuclearCold: !!nuclearCold,
    })
    return fixed
  }

  const prePolish = fixed
  fixed = await polishNovelChapterProse(
    fixed,
    billing ? { ...billing, reason: '??????????' } : undefined,
    {
      mode: 'chapter',
      colloquialBoost: true,
      minLen,
      maxLen,
    },
  )
  const fixedN = countNovelChars(fixed)
  // ??/????????????????????????????????????
  if (fixedN < softMin) {
    if (preN >= softMin) {
      logTaskWarn('Novel', 'outline-compliance-polish-shrunk', {
        chapterNumber,
        preN,
        fixedN,
        softMin,
      })
      return prePolish
    }
    logTaskWarn('Novel', 'outline-compliance-fix-too-short', {
      chapterNumber,
      preN,
      fixedN,
      softMin,
    })
    return null
  }
  return fixed
}

/**
 * ??????????????passed=false ? reasons ??????? UI ????
 */
export async function maybeFixOutlineCompliance(args: {
  content: string
  dramaId: number
  chapterNumber: number
  chapterOutline?: string
  writingBrief?: string
  existingText?: string
  billing?: TextBillingContext
  /** ?????????? UI target_length ??????? 2700/2800 */
  userTarget?: number
  minLen?: number
  maxLen?: number
  maxRounds?: number
  onProgress?: (status: string) => void
  /**
   * rewrite??????/?????generate / continue / ???????????
   * ?? rewrite????????
   */
  mode?: 'generate' | 'rewrite' | 'continue'
}): Promise<OutlineComplianceFixResult> {
  const {
    dramaId, chapterNumber, chapterOutline, writingBrief, existingText, billing,
    maxRounds = OUTLINE_COMPLIANCE_MAX_ROUNDS,
    onProgress,
    mode = 'rewrite',
  } = args
  const considerNext = mode === 'rewrite'
  let content = args.content.trim()
  if (!content) {
    return { content, fixed: false, passed: true, attempts: 0, reasons: [] }
  }

  const boundary = alignNovelChapterOutlineBoundary({
    chapterOutline,
    writingBrief,
    existingText,
    mode: mode === 'continue' ? 'continue' : mode === 'generate' ? 'generate' : 'rewrite',
    chapterNumber,
  })
  const alignedBrief = boundary.alignedBrief || writingBrief
  const outlineOnlyBrief = buildOutlineOnlyWritingStub(chapterOutline)

  // ????? userTarget ? ? min/max ?? ? ???????? 3000?????
  const inferredFromBand = args.minLen != null && args.maxLen != null
    ? Math.round((Number(args.minLen) / 0.9 + Number(args.maxLen) / 1.12) / 2)
    : args.minLen != null
      ? Math.round(Number(args.minLen) / 0.9)
      : undefined
  const userTarget = Math.min(
    20000,
    Math.max(500, Math.round(Number(args.userTarget) || inferredFromBand || 3000)),
  )
  const beatTarget = resolveEffectiveChapterTarget({
    chapterOutline,
    userTarget,
  })
  const targetFallback = beatTarget.effectiveTarget
  const minLen = Math.max(
    400,
    Math.floor(args.minLen ?? Math.round(targetFallback * 0.9)),
  )
  const maxLen = Math.max(
    minLen + 100,
    Math.floor(args.maxLen ?? Math.round(targetFallback * 1.12)),
  )

  const prevChapterTail = chapterNumber >= 2
    ? await loadPrevChapterContentTail(dramaId, chapterNumber, 8000)
    : ''
  const nextChapterOutline = considerNext
    ? await loadNextChapterOutline(dramaId, chapterNumber)
    : ''
  const nextChapterHead = considerNext
    ? await loadNextChapterContentHead(dramaId, chapterNumber, 1000)
    : ''
  const { loadPrevChapterEndSnapshot } = await import('./novel-chapter-end-snapshot.js')
  const prevSnapshot = chapterNumber >= 2
    ? await loadPrevChapterEndSnapshot(dramaId, chapterNumber)
    : null

  // 模型审注入：状态卡 6 维 + 账本 15 维
  let prevStateCardBlock = ''
  let nextStateCardBlock = ''
  let prevLedgerBlock = ''
  try {
    const {
      readEpisodeChapterStateCard,
      readEpisodeContinuityLedger,
    } = await import('../../common/drama/episode-meta.js')
    const { formatStateCardSixDimAuditBlock } = await import('../../common/novel/novel-state-card.js')
    const { formatContinuityLedgerAuditBlock } = await import('../../common/novel/novel-continuity-state.js')
    if (chapterNumber >= 2) {
      const prevEp = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, chapterNumber - 1)
      if (prevEp) {
        const prevCard = readEpisodeChapterStateCard(prevEp.metadata, chapterNumber - 1)
        if (prevCard) prevStateCardBlock = formatStateCardSixDimAuditBlock(prevCard, 'prev')
        const prevLedger = readEpisodeContinuityLedger(prevEp.metadata, chapterNumber - 1)
        prevLedgerBlock = formatContinuityLedgerAuditBlock(
          prevLedger,
          `【一致性账本·15维·上章第${chapterNumber - 1}章末——章初须自洽】`,
        )
      }
    }
    if (considerNext) {
      const nextEp = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, chapterNumber + 1)
      if (nextEp) {
        const nextCard = readEpisodeChapterStateCard(nextEp.metadata, chapterNumber + 1)
        if (nextCard) nextStateCardBlock = formatStateCardSixDimAuditBlock(nextCard, 'next')
      }
    }
  } catch (err: unknown) {
    logTaskWarn('Novel', 'outline-dimension-context-load-failed', {
      chapterNumber,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const detectLocal = (text: string, briefForDetect?: string) => detectOutlineCompliance({
    content: text,
    chapterOutline,
    writingBrief: briefForDetect ?? alignedBrief,
    existingText,
    prevChapterTail,
    nextChapterOutline: considerNext ? (nextChapterOutline || undefined) : undefined,
    nextChapterHead: considerNext ? (nextChapterHead || undefined) : undefined,
    chapterNumber,
    prevSnapshot,
  })

  const detect = async (text: string, briefForDetect?: string) => {
    const brief = briefForDetect ?? alignedBrief
    const local = detectLocal(text, brief)
    onProgress?.('维度自洽模型审')
    const modelReasons = await auditOutlineBoundaryWithModel({
      content: text,
      chapterOutline,
      writingBrief: brief,
      nextChapterOutline: considerNext ? (nextChapterOutline || undefined) : undefined,
      prevChapterTail: prevChapterTail || undefined,
      prevSnapshotBlock: prevSnapshot
        ? (await import('./novel-chapter-end-snapshot.js')).formatChapterEndSnapshotBlock(prevSnapshot)
        : undefined,
      prevStateCardBlock: prevStateCardBlock || undefined,
      nextStateCardBlock: nextStateCardBlock || undefined,
      prevLedgerBlock: prevLedgerBlock || undefined,
      chapterNumber,
      billing,
    })
    if (!modelReasons.length) return local
    const merged = [...local.reasons]
    for (const r of modelReasons) {
      if (!merged.some(x => x.message === r.message)) merged.push(r)
    }
    return { ok: false, reasons: merged }
  }

  const scoreOf = (text: string, briefForScore?: string) => scoreOutlineCandidate({
    text,
    chapterOutline,
    writingBrief: briefForScore ?? alignedBrief,
    existingText,
    prevChapterTail,
    nextChapterOutline: nextChapterOutline || undefined,
    nextChapterHead: nextChapterHead || undefined,
    chapterNumber,
  })

  let check = await detect(content)
  if (check.ok) {
    return { content, fixed: false, passed: true, attempts: 0, reasons: [] }
  }

  /** 正文级删毒：去掉大纲无关句；末行动拍之后一律丢弃，再进入 LLM 修写 */
  const shouldStripPoison = (reasons: OutlineComplianceReason[]) =>
    reasons.some(r =>
      r.code === 'outline_endpoint_overshoot'
      || r.code === 'outline_boundary_model'
      || r.code === 'next_chapter_beat_leak'
      || r.code === 'draft_orphan_replay'
      || r.code === 'head_orphan_span',
    )

  const applyPoisonStrip = (text: string): string => {
    if (!chapterOutline?.trim()) return text
    const stripped = stripOutlinePoisonProse({ content: text, chapterOutline })
    if (!stripped.changed) return text
    // 删毒结果为空：保留原文（旧逻辑清空会导致修写级联 + 越界稿硬拒）
    if (!stripped.text.trim()) {
      logTaskWarn('Novel', 'outline-poison-strip-empty-keep', {
        chapterNumber,
        from: countNovelChars(text),
        actionBeat: stripped.actionBeat.slice(0, 40),
      })
      return text
    }
    if (stripped.keepCount < 1) {
      logTaskWarn('Novel', 'outline-poison-strip-empty-keep', {
        chapterNumber,
        from: countNovelChars(text),
        to: countNovelChars(stripped.text),
        actionBeat: stripped.actionBeat.slice(0, 40),
      })
      return text
    }
    // 删毒后可能很短（再由 LLM 在大纲内写厚）；只要确实砍掉毒段就采用
    if (stripped.removedChars < 80 && countNovelChars(stripped.text) < 40) return text
    logTaskWarn('Novel', 'outline-poison-strip', {
      chapterNumber,
      from: countNovelChars(text),
      to: countNovelChars(stripped.text),
      keep: stripped.keepCount,
      discard: stripped.discardCount,
      removedChars: stripped.removedChars,
      actionBeat: stripped.actionBeat.slice(0, 40),
    })
    return stripped.text
  }

  if (shouldStripPoison(check.reasons)) {
    const sanitized = applyPoisonStrip(content)
    if (sanitized !== content) {
      content = sanitized
      // 全毒清空：禁止当成「已通过」提前返回；进入按大纲重写
      if (!content.trim()) {
        check = {
          ok: false,
          reasons: [{
            code: 'outline_endpoint_overshoot',
            message: '删毒后无有效正文：原文与本章大纲保留拍无关，须按大纲重写',
          }],
        }
      } else {
        check = await detect(content)
        const afterStripChars = countNovelChars(content)
        // 删毒后远短于本章目标：不得标通过（日志曾出现 chars=60 score=10000）
        const stripFloor = Math.max(400, Math.round(minLen * 0.45))
        if (check.ok && afterStripChars < stripFloor) {
          check = {
            ok: false,
            reasons: [{
              code: 'outline_endpoint_overshoot',
              message:
                `删毒后正文过短（约${afterStripChars}字，低于本章下限约${stripFloor}字），须按大纲重写补足，禁止以碎片稿通过`,
            }],
          }
        } else if (check.ok) {
          return { content, fixed: true, passed: true, attempts: 0, reasons: [] }
        }
      }
    }
  }

  /** ????/????????? stub????????????????? */
  const originalHasSeamIssue = check.reasons.some(
    r => r.code === 'chapter_seam_cold_open',
  )
  const fixBrief = originalHasSeamIssue ? outlineOnlyBrief : (alignedBrief || '')

  logTaskWarn('Novel', 'outline-compliance', {
    chapterNumber,
    codes: check.reasons.map(r => r.code),
    maxRounds,
    minLen,
    maxLen,
    hasNextOutline: !!nextChapterOutline,
    outlineOnlyBrief: originalHasSeamIssue,
  })

  const original = content
  const softMin = Math.round(minLen * 0.97)
  const coldSoftFloor = Math.round(minLen * 0.72)
  let attempts = 0
  let best = content
  let bestReasons = check.reasons
  let lastReasons = check.reasons
  /** ?????????????????????????????????? */
  let bestStillOriginal = true

  const inSoftBand = (text: string) => countNovelChars(text) >= softMin

  const reasonPenalty = (reasons: OutlineComplianceReason[]) => {
    const hard = new Set([
      'outline_endpoint_overshoot',
      'early_beats_missing',
      'chapter_seam_cold_open',
      'next_chapter_beat_leak',
      'outline_boundary_model',
      'head_orphan_span',
      'draft_orphan_replay',
      'catalyst_agency_fail',
    ])
    return reasons.reduce((s, r) => {
      if (r.code === 'chapter_seam_cold_open') return s + 220
      if (r.code === 'catalyst_agency_fail') return s + 180
      return s + (hard.has(r.code) ? 100 : 40)
    }, 0)
  }

  /** ????????/??????????????? */
  const seamHardRank = (reasons: OutlineComplianceReason[]): number => {
    let rank = 0
    if (reasons.some(r => r.code === 'chapter_seam_cold_open')) rank += 1000
    if (reasons.some(r => r.code === 'catalyst_agency_fail')) rank += 500
    if (reasons.some(r => r.code === 'early_beats_missing')) rank += 300
    // soft: overshoot / replay / orphan ? do not dominate adoption
    if (reasons.some(r => r.code === 'outline_endpoint_overshoot')) rank += 120
    if (reasons.some(r => r.code === 'outline_boundary_model')) rank += 100
    if (reasons.some(r => r.code === 'next_chapter_beat_leak')) rank += 180
    if (reasons.some(r => r.code === 'chapter_forward_seam_copy')) rank += 140
    if (reasons.some(r => r.code === 'chapter_event_replay')) rank += 60
    if (reasons.some(r => r.code === 'head_orphan_span')) rank += 80
    if (reasons.some(r => r.code === 'draft_orphan_replay')) rank += 40
    return rank
  }

  let bestScore = scoreOf(content, fixBrief) - reasonPenalty(check.reasons)

  /** ??????????????? / ?????????????????????? */
  const shouldAdoptFailedCandidate = (
    candidate: string,
    candidateReasons: OutlineComplianceReason[],
    current: string,
    currentReasons: OutlineComplianceReason[],
  ): boolean => {
    const cN = countNovelChars(candidate)
    const curN = countNovelChars(current)
    const cRank = seamHardRank(candidateReasons)
    const curRank = seamHardRank(currentReasons)
    const bothCold = cRank >= 1000 && curRank >= 1000
    const floor = (cRank < curRank || curRank >= 1000 || originalHasSeamIssue)
      ? coldSoftFloor
      : softMin

    if (cN < floor) return false

    // ?????? ? ?????????
    if (cRank < curRank) return true
    if (cRank > curRank && curN >= floor) return false

    const cPen = reasonPenalty(candidateReasons)
    const curPen = reasonPenalty(currentReasons)
    const cScore = scoreOf(candidate) - cPen
    const curScore = scoreOf(current) - curPen

    // ????????????????????
    if (bothCold || (originalHasSeamIssue && bestStillOriginal && curRank >= 1000)) {
      if (cScore > curScore + 10) return true
      if (cScore + 10 < curScore) return false
      return false
    }

    // ???????????? ? ??
    const inMaxBand = (n: number) => n <= Math.round(maxLen * 1.02)
    const hasOvershoot = (reasons: OutlineComplianceReason[]) =>
      reasons.some(r =>
        r.code === 'outline_endpoint_overshoot'
        || r.code === 'outline_boundary_model'
        || r.code === 'next_chapter_beat_leak',
      )
    if (inMaxBand(cN) && !inMaxBand(curN) && cN >= softMin) return true
    if (hasOvershoot(candidateReasons) && hasOvershoot(currentReasons) && cN >= softMin && cN < curN) {
      return true
    }

    if (cN >= softMin && curN < softMin) return true
    if (cN < softMin && curN >= softMin) return false
    if (cScore > curScore + 15) return true
    if (cScore + 15 < curScore) return false
    if (cN >= softMin && curN >= softMin) {
      if (inMaxBand(cN) !== inMaxBand(curN)) return inMaxBand(cN)
      if (hasOvershoot(currentReasons) || hasOvershoot(candidateReasons)) return cN <= curN
      return Math.abs(cN - curN) <= Math.round(curN * 0.08)
    }
    return cN > curN
  }

  for (let round = 1; round <= maxRounds; round++) {
    attempts = round
    onProgress?.(`???????? ${round}/${maxRounds} ??`)
    const orphan = lastReasons.find(r => r.code === 'draft_orphan_replay')?.detail
    // ??????????? best ???????????????????
    const rewriteBase = bestStillOriginal ? original : best
    let next = await rewriteOnceForOutline({
      content: rewriteBase,
      reasons: lastReasons,
      chapterOutline,
      writingBrief: fixBrief,
      orphanDraftExcerpt: orphan,
      nextChapterOutline: nextChapterOutline || undefined,
      nextChapterHead: nextChapterHead || undefined,
      prevChapterTail: prevChapterTail || undefined,
      chapterNumber,
      billing,
      minLen,
      maxLen,
    })

    if (!next) {
      logTaskWarn('Novel', 'outline-compliance-fix-unusable', { chapterNumber, round })
      continue
    }

    // 修写稿不在此删毒：不一致留给本轮 detect；交付时对最终稿只删一次
    const nextCheck = await detect(next, fixBrief)
    lastReasons = nextCheck.reasons
    const nextScore = scoreOf(next, fixBrief) - reasonPenalty(nextCheck.reasons)
    logTaskWarn('Novel', 'outline-compliance-fix', {
      chapterNumber,
      round,
      ok: nextCheck.ok,
      codes: nextCheck.reasons.map(r => r.code),
      chars: countNovelChars(next),
      score: nextScore,
      minLen,
      maxLen,
    })

    if (nextCheck.ok) {
      return {
        content: next,
        fixed: true,
        passed: true,
        attempts,
        reasons: [],
      }
    }

    if (shouldAdoptFailedCandidate(next, nextCheck.reasons, best, bestReasons)) {
      best = next
      bestScore = nextScore
      bestReasons = nextCheck.reasons
      bestStillOriginal = false
    } else {
      logTaskWarn('Novel', 'outline-compliance-fix-discard-short', {
        chapterNumber,
        round,
        nextChars: countNovelChars(next),
        bestChars: countNovelChars(best),
        nextScore,
        bestScore,
        softMin,
      })
    }
  }

  // ?????????/??????????????? stub???? best?????????????
  if (
    originalHasSeamIssue
    && bestReasons.some(r => r.code === 'chapter_seam_cold_open')
  ) {
    onProgress?.('????????')
    const nuclearBase = bestStillOriginal ? original : best
    let nuclear = await rewriteOnceForOutline({
      content: nuclearBase,
      reasons: bestReasons.some(r => r.code === 'chapter_seam_cold_open')
        ? bestReasons
        : check.reasons,
      chapterOutline,
      writingBrief: outlineOnlyBrief,
      nextChapterOutline: nextChapterOutline || undefined,
      nextChapterHead: nextChapterHead || undefined,
      prevChapterTail: prevChapterTail || undefined,
      chapterNumber,
      billing,
      minLen,
      maxLen,
      nuclearCold: true,
    })
    attempts += 1
    if (nuclear) {
      const nuclearCheck = await detect(nuclear, outlineOnlyBrief)
      const nuclearScore = scoreOf(nuclear, outlineOnlyBrief) - reasonPenalty(nuclearCheck.reasons)
      const nuclearN = countNovelChars(nuclear)
      const clearedSeam = !nuclearCheck.reasons.some(
        r => r.code === 'chapter_seam_cold_open',
      )
      logTaskWarn('Novel', 'outline-compliance-nuclear-cold', {
        chapterNumber,
        ok: nuclearCheck.ok,
        codes: nuclearCheck.reasons.map(r => r.code),
        chars: nuclearN,
        score: nuclearScore,
        clearedCold: clearedSeam,
      })
      if (nuclearCheck.ok) {
        return {
          content: nuclear,
          fixed: true,
          passed: true,
          attempts,
          reasons: [],
        }
      }
      const nuclearCold = nuclearCheck.reasons.some(r => r.code === 'chapter_seam_cold_open')
      const bestCold = bestReasons.some(r => r.code === 'chapter_seam_cold_open')
      if (
        nuclearN >= coldSoftFloor
        && (clearedSeam
          || (!nuclearCold && bestCold)
          || seamHardRank(nuclearCheck.reasons) < seamHardRank(bestReasons))
      ) {
        best = nuclear
        bestScore = nuclearScore
        bestReasons = nuclearCheck.reasons
        bestStillOriginal = false
      }
    } else {
      logTaskWarn('Novel', 'outline-compliance-nuclear-cold-unusable', { chapterNumber })
    }
  }

  // 先选定交付稿，再对最终稿最多删毒一次（删与大纲不一致处）；禁止选稿路径反复删毒
  let deliver = best
  const originalScore = scoreOf(original, fixBrief) - reasonPenalty(check.reasons)
  const originalRank = seamHardRank(check.reasons)
  const bestRank = seamHardRank(bestReasons)
  const bestN = countNovelChars(best)

  if (originalHasSeamIssue && !bestStillOriginal && bestN >= coldSoftFloor) {
    deliver = best
    logTaskWarn('Novel', 'outline-compliance-exhausted-keep-cold-fix', {
      chapterNumber,
      bestChars: bestN,
      originalChars: countNovelChars(original),
      bestRank,
      originalRank,
      bestScore,
      originalScore,
    })
  } else if (bestRank < originalRank && bestN >= coldSoftFloor) {
    deliver = best
    logTaskWarn('Novel', 'outline-compliance-exhausted-prefer-seam-rank', {
      chapterNumber,
      bestChars: bestN,
      originalChars: countNovelChars(original),
      bestRank,
      originalRank,
    })
  } else if (
    !originalHasSeamIssue
    && originalRank <= bestRank
    && inSoftBand(original)
    && (!inSoftBand(best) || originalScore > bestScore + 40)
  ) {
    if (originalScore > bestScore + 40) {
      deliver = original
      logTaskWarn('Novel', 'outline-compliance-exhausted-keep-original-score', {
        chapterNumber,
        bestChars: bestN,
        originalChars: countNovelChars(original),
        bestScore,
        originalScore,
      })
    }
  } else if (
    !originalHasSeamIssue
    && originalRank <= bestRank
    && !inSoftBand(best)
    && inSoftBand(original)
    && originalScore >= bestScore - 20
  ) {
    deliver = original
    logTaskWarn('Novel', 'outline-compliance-exhausted-keep-length', {
      chapterNumber,
      bestChars: bestN,
      originalChars: countNovelChars(original),
      softMin,
    })
  }

  {
    const preStrip = deliver
    const preDetect = await detect(preStrip, fixBrief)
    if (shouldStripPoison(preDetect.reasons)) {
      deliver = applyPoisonStrip(preStrip)
      if (deliver !== preStrip) {
        logTaskWarn('Novel', 'outline-poison-strip-final', {
          chapterNumber,
          from: countNovelChars(preStrip),
          to: countNovelChars(deliver),
        })
      }
    }
  }

  // 交付态仍为空：硬拒（勿交给后续一致性审去报 empty_content）
  if (!deliver.trim()) {
    const emptyReasons: OutlineComplianceReason[] = lastReasons.length
      ? lastReasons
      : [{
          code: 'outline_endpoint_overshoot',
          message: '删毒/修写后无有效正文，须按本章大纲重写',
        }]
    logTaskWarn('Novel', 'outline-compliance-hard-reject-empty', {
      chapterNumber,
      attempts,
      codes: emptyReasons.map(r => r.code),
    })
    return {
      content: '',
      fixed: true,
      passed: false,
      attempts,
      reasons: emptyReasons,
      hardReject: true,
    }
  }

  const deliverCheck = await detect(deliver, fixBrief)
  lastReasons = deliverCheck.reasons
  const deliverStillSeam = lastReasons.some(
    r => r.code === 'chapter_seam_cold_open',
  )
  const deliverStillOvershoot = lastReasons.some(
    r => r.code === 'outline_endpoint_overshoot'
      || r.code === 'outline_boundary_model'
      || r.code === 'next_chapter_beat_leak',
  )
  const deliverStillEventReplay = lastReasons.some(r => r.code === 'chapter_event_replay')
  const deliverChars = countNovelChars(deliver)
  const deliverOverLength = deliverChars > Math.round(maxLen * 1.05)

  logTaskWarn('Novel', 'outline-compliance-exhausted', {
    chapterNumber,
    attempts,
    codes: lastReasons.map(r => r.code),
    chars: deliverChars,
    score: scoreOf(deliver, fixBrief),
    minLen,
    maxLen,
    keptColdFix: originalHasSeamIssue && !bestStillOriginal,
    deliverStillSeam,
    deliverStillOvershoot,
    deliverOverLength,
  })

  // 章缝冷开篇未修好 → 硬拒绝
  if (deliverStillSeam) {
    logTaskWarn('Novel', 'outline-compliance-hard-reject', {
      chapterNumber,
      codes: lastReasons.map(r => r.code),
      chars: deliverChars,
      originalHasSeamIssue,
    })
    return {
      content: '',
      fixed: false,
      passed: false,
      attempts,
      reasons: lastReasons.length ? lastReasons : check.reasons,
      hardReject: true,
    }
  }

  // catalyst_agency_fail 等与章缝同类：修不掉则硬拒绝（见下方）
  const deliverStillAgency = lastReasons.some(r => r.code === 'catalyst_agency_fail')
  const deliverStillForward = lastReasons.some(r => r.code === 'chapter_forward_seam_copy')
  const deliverStillOrphan = lastReasons.some(r => r.code === 'draft_orphan_replay')

  // 章末越界 / 下章抢戏：删毒后仍在则软告警，把正文交给后续 21 维一致性审
  // （证据：hardReject 会 buildHardRejectContinuityCheck 写成 score=0 且 dimensions=0，绕过主审）
  if (deliverStillOvershoot) {
    logTaskWarn('Novel', 'outline-compliance-overshoot-soft-to-continuity', {
      chapterNumber,
      codes: lastReasons.map(r => r.code),
      chars: deliverChars,
    })
  }

  if (
    deliverOverLength
    || deliverStillEventReplay
    || deliverStillOrphan
    || deliverStillAgency
    || deliverStillForward
    || deliverStillOvershoot
  ) {
    logTaskWarn('Novel', 'outline-compliance-soft-warn', {
      chapterNumber,
      codes: lastReasons.map(r => r.code),
      chars: deliverChars,
      maxLen,
      deliverStillOvershoot,
      deliverOverLength,
      deliverStillEventReplay,
      deliverStillOrphan,
      deliverStillAgency,
      deliverStillForward,
    })
  }

  // 仅剩软告警时可标大纲关通过；越界已改为交给 21 维，列入 softOnly 以免 outline_compliance 误导 UI
  const softOnly = lastReasons.length > 0 && lastReasons.every(r => [
    'early_beats_missing',
    'outline_boundary_model',
    'outline_endpoint_overshoot',
    'next_chapter_beat_leak',
    'chapter_event_replay',
    'draft_orphan_replay',
    'catalyst_agency_fail',
    'chapter_forward_seam_copy',
    'brief_pacing',
    'brief_pending_overshoot',
    'named_as_generic_epithet',
    'named_as_generic',
    'head_orphan_span',
    'opening_mid_dialogue',
    'opening_unexplained_name',
  ].includes(r.code))

  return {
    content: deliver,
    fixed: deliver !== original,
    passed: lastReasons.length === 0 || softOnly,
    attempts,
    reasons: lastReasons,
  }
}
