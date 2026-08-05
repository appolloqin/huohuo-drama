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
    'outline_boundary_model',
    'head_orphan_span',
  ])
  // overshoot / event_replay / draft_orphan??????????????????
  for (const r of check.reasons) {
    if (r.code === 'chapter_seam_cold_open') score -= 160
    else if (hard.has(r.code)) score -= 80
    else if (
      r.code === 'outline_endpoint_overshoot'
      || r.code === 'chapter_event_replay'
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
    onProgress?.('??????????')
    const modelReasons = await auditOutlineBoundaryWithModel({
      content: text,
      chapterOutline,
      writingBrief: brief,
      nextChapterOutline: considerNext ? (nextChapterOutline || undefined) : undefined,
      prevChapterTail: prevChapterTail || undefined,
      prevSnapshotBlock: prevSnapshot
        ? (await import('./novel-chapter-end-snapshot.js')).formatChapterEndSnapshotBlock(prevSnapshot)
        : undefined,
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
    const next = await rewriteOnceForOutline({
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
    const nuclear = await rewriteOnceForOutline({
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

  // ????????????????????/?????????
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

  // ????????
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

  // catalyst_agency_fail?????????? C ????????? chapter_seam_cold_open
  const deliverStillAgency = lastReasons.some(r => r.code === 'catalyst_agency_fail')
  const deliverStillForward = lastReasons.some(r => r.code === 'chapter_forward_seam_copy')
  const deliverStillOrphan = lastReasons.some(r => r.code === 'draft_orphan_replay')
  const softOnly = lastReasons.length > 0 && lastReasons.every(r => [
    'early_beats_missing',
    'outline_endpoint_overshoot',
    'outline_boundary_model',
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

  if (
    deliverStillOvershoot
    || deliverOverLength
    || deliverStillEventReplay
    || deliverStillOrphan
    || deliverStillAgency
    || deliverStillForward
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
      softOnly,
    })
  }

  // soft-only leftovers: accept + warn (never empty hard-reject)
  return {
    content: deliver,
    fixed: deliver !== original,
    passed: softOnly,
    attempts,
    reasons: lastReasons,
  }
}
