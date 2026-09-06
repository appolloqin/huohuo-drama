/**
 * AI 率多证据融合引擎（spec §5.8）。统一入口 runAiDetect：
 * <80 字统计 stub → cache → S1 → S2 多窗（探测+预算+失败记账）→ S3/S4 → 融合（护栏/置信/needs_review）
 * → S5（仅临界带、1 次改写、快速重评）→ 段融合（同权重）+ topK 局部复检 → 组装（兼容旧字段）+ 落缓存。
 */
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import {
  AI_DETECT_ENGINE_VERSION, SHORT_TEXT_CHARS, SHORT_TEXT_PROB_MAX,
  normalizeGenre, isCriticalBand, type Genre,
} from '../../common/novel/novel-detect-calib.js'
import { sameFamilyDetect, crossModelDetectWarning } from '../../common/novel/novel-model-family.js'
import { detectAiText, hashNovelContent, buildAiDetectionSuggestions, type AiDetectionResult, type AiDetectionSignal } from './ai-text-detection.js'
import { extractRawFeatures } from './ai-detect-features.js'
import { loadCalibProfile, pplLineScore, pplToZ } from './ai-detect-calibration.js'
import { fuseEvidence, type FusionResult, type RefLineInput } from './ai-detect-fusion.js'
import { charWindows, windowText, buildFusedSegments, countHighBandSegments, bandFromAigc, type AiDetectSegment, type AiDetectSamplingWindow } from './ai-detect-segments.js'
import { fingerprintEvidence } from './ai-detect-model-fingerprint.js'
import { maybeAdversarialPass, type PerturbOutcome } from './ai-detect-perturbation.js'
import { lookupRunCache, recordRun } from './ai-detect-store.js'
import { pickBudgetTier, resolveBudget, cacheKeyFor, type ReferenceScorer } from './ai-detect-budget.js'

export type { ReferenceScorer } from './ai-detect-budget.js'

export interface RunAiDetectOptions {
  genre?: unknown
  /** 计费与缓存归属（缺 userIdForCache 时用 billing.userId） */
  billing?: { userId: number; role?: string; resourceType?: string }
  userIdForCache?: number
  skipCacheStore?: boolean
  referenceScorer?: ReferenceScorer
  perturbRewriter?: (text: string) => Promise<string>
  enableAdversarial?: boolean
  /** 写作模型提示（章节检测传 writing_model；驱动同系判定） */
  writingModelHint?: string
  /** runs.source_type 标签（text/file/audio/video/novel_chapter） */
  sourceTypeHint?: string
  /** 手动指定预算档（路由 budget_tier 透传；缺省按长度自动） */
  budgetTier?: 'short' | 'standard' | 'long'
}

export async function runAiDetect(text: string, options: RunAiDetectOptions = {}): Promise<AiDetectionResult> {
  const started = Date.now()
  const trimmed = (text || '').trim()
  const genre = normalizeGenre(options.genre)
  const charCount = countNovelChars(trimmed)
  const calib = await loadCalibProfile()

  if (charCount < 80) {
    return runAiDetectStub(trimmed, genre, calib, started)
  }

  // —— cache（spec §4 步 2；扰动结果在 resultJson.evidence 内复用）——
  const tier = options.budgetTier ?? pickBudgetTier(charCount)
  const budget = resolveBudget(tier)
  const probe = cacheKeyFor({
    contentHash: hashNovelContent(trimmed),
    genre,
    tier,
    engineVersion: AI_DETECT_ENGINE_VERSION,
    refKey: options.referenceScorer ? 'injected' : (await getProbeKeySafe()),
    perturbed: options.enableAdversarial !== false,
    profileVersion: calib.meta.version,
  })
  if (!options.skipCacheStore) {
    try {
      const hit = await lookupRunCache(probe)
      if (hit?.row.resultJson) {
        const cached = JSON.parse(hit.row.resultJson) as AiDetectionResult
        if (cached && Number.isFinite(cached.probability)) {
          cached.cache_hit = true
          cached.elapsed_ms = Date.now() - started
          return cached
        }
      }
    } catch { /* cache never blocks */ }
  }

  // —— S1 raws ——
  const raws = extractRawFeatures(trimmed)

  // —— S2 多窗 ——
  const scorer: ReferenceScorer = options.referenceScorer ?? (async (t, opts) => {
    const { scoreWithReference } = await import('./ai-detect-reference.js')
    return scoreWithReference(t, { billing: opts?.billing as never, maxCandidates: opts?.maxCandidates })
  })
  let callsUsed = 0
  const scoredZ: number[] = []
  let repPpl: number | undefined
  let repModel = ''
  let repMeanLogprob: number | undefined
  let repMode: 'echo' | 'prompt_logprobs' | 'proxy' | null = null
  let scoredChars = 0
  let analyzedTokens = 0
  const windowResults: AiDetectSamplingWindow[] = []
  let firstFailure = ''
  if (budget.maxCandidates > 0) {
    for (const w of charWindows(trimmed, budget.windowChars)) {
      const body = windowText(trimmed, w)
      if (countNovelChars(body) < 80) continue
      if (callsUsed >= budget.refCallBudget) {
        windowResults.push({ ...w, status: 'skipped' })
        continue
      }
      callsUsed++
      try {
        const r = await scorer(body, { billing: options.billing, maxCandidates: budget.maxCandidates })
        const z = pplTrackZ(calib, r)
        if (z == null) {
          // 未校准 track：按打分失败处理（spec §5.3/§10：不抛、记 reason）
          firstFailure ||= `参考模型 ${r.model} 无 ppl_tracks 校准档案`
          windowResults.push({ ...w, status: 'uncalibrated', perplexity: Math.round(r.ppl * 100) / 100 })
          continue
        }
        const line = pplLineScore(z, r.mode === 'proxy' ? 0.4 : 1.0)
        scoredZ.push(z)
        scoredChars += countNovelChars(body)
        analyzedTokens += r.tokenCount || 0
        if (!repModel) { repModel = r.model; repMode = r.mode; repPpl = r.ppl; repMeanLogprob = r.meanLogprob }
        windowResults.push({ ...w, status: 'scored', perplexity: Math.round((r.ppl ?? 0) * 100) / 100, probability: line == null ? undefined : Math.round(line * 100) })
      } catch (err) {
        firstFailure ||= (err as Error)?.message || '参考模型打分失败'
        windowResults.push({ ...w, status: 'failed' })
      }
    }
  }

  const repZ = reduceZ(scoredZ)
  const refLine: RefLineInput | null = repZ != null && repMode
    ? { mode: repMode, model: repModel, z: repZ, calibrated: true, ppl: repPpl, meanLogprob: repMeanLogprob }
    : null
  const sameFamily = !!(options.writingModelHint && refLine && sameFamilyDetect(options.writingModelHint, refLine.model))

  // —— S3 ——
  const fp = await fingerprintEvidence(trimmed).catch(() => null)

  // —— full fusion pass 1 ——
  let fusion = fuseEvidence({
    raws, genre,
    table: calib.tableFor(genre), weights: calib.weightsFor(genre),
    ref: refLine, sameFamily, statsSub: calib.statsSub, fpSim: fp?.sim ?? null,
  })

  // —— S5 临界扰动 ——
  let perturb: PerturbOutcome | undefined
  if (options.enableAdversarial !== false && budget.allowPerturb && isCriticalBand(fusion.probability)) {
    perturb = await maybeAdversarialPass({
      text: trimmed,
      billing: options.billing as never,
      fastScore: (para) => fuseEvidence({
        raws: extractRawFeatures(para), genre,
        table: calib.tableFor(genre), weights: calib.weightsFor(genre),
        ref: null, sameFamily, statsSub: calib.statsSub,
      }).probability,
    }, options.perturbRewriter).catch((e) => ({ applied: false, stability: null, error: (e as Error)?.message } as PerturbOutcome))
    if (perturb?.applied && perturb.stability != null) {
      fusion = fuseEvidence({
        raws, genre,
        table: calib.tableFor(genre), weights: calib.weightsFor(genre),
        ref: refLine, sameFamily, statsSub: calib.statsSub, fpSim: fp?.sim ?? null, perturbStab: perturb.stability,
      })
    }
  }

  // —— 段融合 + topK 局部复检 ——
  let segs: AiDetectSegment[] = buildFusedSegments(trimmed, {
    genre, table: calib.tableFor(genre), weights: calib.weightsFor(genre), statsSub: calib.statsSub,
    ref: refLine, fpSim: fp?.sim ?? null, perturbStab: perturb?.stability ?? null, sameFamily,
  })
  if (budget.segTopK > 0 && refLine) {
    const hot = segs
      .filter((s) => (s.text ? countNovelChars(s.text) : s.char_end - s.char_start) >= 80)
      .sort((a, b) => b.aigc - a.aigc)
      .slice(0, budget.segTopK)
    for (const seg of hot) {
      if (callsUsed >= budget.refCallBudget) break
      const body = trimmed.slice(seg.char_start, seg.char_end)
      callsUsed++
      try {
        const r = await scorer(body, { billing: options.billing, maxCandidates: 1 })
        const z = pplTrackZ(calib, r)
        if (z == null) continue
        const f = fuseEvidence({
          raws: extractRawFeatures(body), genre,
          table: calib.tableFor(genre), weights: calib.weightsFor(genre), statsSub: calib.statsSub,
          ref: { ...refLine, z, ppl: r.ppl, meanLogprob: r.meanLogprob, model: r.model || refLine.model, mode: r.mode || refLine.mode },
          sameFamily,
          fpSim: fp?.sim ?? null,
          perturbStab: perturb?.stability ?? null,
        })
        const a3 = Math.round(f.probability) / 100
        seg.aigc = a3
        seg.band = bandFromAigc(a3)
        seg.probability = f.probability
        seg.perplexity = Math.round((r.ppl ?? 0) * 100) / 100
      } catch (err) { firstFailure ||= (err as Error)?.message }
    }
  }
  const highBandCount = countHighBandSegments(segs)

  // —— finalize（兼容旧形状 + 新字段）——
  const result = finalizeFusionResult({
    fusion, segs, highBandCount, raws, trimmed, genre, calib,
    refLine, sameFamily,
    windowResults, callsUsed,
    fpSim: fp?.sim ?? null, fpModel: fp?.model, perturb,
    firstFailure, options, started, charCount, scoredChars, analyzedTokens, repPpl, repMeanLogprob, repModel,
  })

  if (!options.skipCacheStore) {
    await recordRun({
      probe,
      result: { ...result, segments: segs.map((s) => ({ ...s, text: undefined })) },
      userId: options.userIdForCache ?? options.billing?.userId ?? null,
      sourceType: options.sourceTypeHint ?? 'text',
      charCount,
    }).catch(() => undefined)
  }
  return result
}

function pplTrackZ(calib: Awaited<ReturnType<typeof loadCalibProfile>>, r: { ppl?: number; model: string; mode?: string }): number | null {
  if (r.ppl == null || r.ppl <= 0) return null
  if (calib.meta.source !== 'profile') return null
  const mode: 'echo' | 'proxy' = r.mode === 'proxy' ? 'proxy' : 'echo'
  const track = calib.pplTrack(r.model, mode)
  if (!track) return null
  return pplToZ(r.ppl, track)
}

/** 多窗 z 聚合：3+ 取中位窗（保守但非极值，spec §4 步 4）；单窗取该窗 */
function reduceZ(zs: number[]): number | null {
  if (!zs.length) return null
  const sorted = zs.slice().sort((a, b) => a - b)
  return sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)]! : sorted[0]!
}

async function getProbeKeySafe(): Promise<string> {
  try {
    const { getRefProbeKey } = await import('./ai-detect-reference.js')
    return await getRefProbeKey()
  } catch { return 'cfg' }
}

/** stub 路径仍走 calib 注入（测试可设档案影响 seed）；method 为 statistical_v2 */
function runAiDetectStub(trimmed: string, genre: Genre, calib: Awaited<ReturnType<typeof loadCalibProfile>>, started: number): AiDetectionResult {
  const base = detectAiText(trimmed)
  const fusion = fuseEvidence({
    raws: extractRawFeatures(trimmed), genre,
    table: calib.tableFor(genre), weights: calib.weightsFor(genre),
    ref: null, sameFamily: false, statsSub: calib.statsSub,
  })
  const p = Math.min(SHORT_TEXT_PROB_MAX, Math.max(4, base.probability))
  return {
    ...base,
    method: 'statistical_v2',
    engine_version: AI_DETECT_ENGINE_VERSION,
    genre,
    evidence: fusion.evidenceLines,
    ref_mode: 'none',
    needs_review: true,
    calibration: 'none',
    probability_band: `${Math.max(4, p - 15)}-${Math.min(SHORT_TEXT_PROB_MAX, p + 15)}`,
    coverage: { windows_total: 0, windows_scored: 0, scored_chars: 0, text_chars: countNovelChars(trimmed) },
    elapsed_ms: Date.now() - started,
    fallback_reason: '正文过短，统计特征不稳定',
  }
}

interface FinalizeArgs {
  fusion: FusionResult
  segs: AiDetectSegment[]
  highBandCount: number
  raws: ReturnType<typeof extractRawFeatures>
  trimmed: string
  genre: Genre
  calib: Awaited<ReturnType<typeof loadCalibProfile>>
  refLine: RefLineInput | null
  sameFamily: boolean
  windowResults: AiDetectSamplingWindow[]
  callsUsed: number
  fpSim: number | null
  fpModel?: string
  perturb?: PerturbOutcome
  firstFailure: string
  options: RunAiDetectOptions
  started: number
  charCount: number
  scoredChars: number
  analyzedTokens: number
  repPpl?: number
  repMeanLogprob?: number
  repModel: string
}
function finalizeFusionResult(args: FinalizeArgs): AiDetectionResult {
  const { fusion, segs, highBandCount, raws, trimmed, genre, calib, refLine, sameFamily } = args
  const legacy = detectAiText(trimmed)
  const method = refLine ? 'fusion_v2' : 'statistical_v2'
  const needsReview = fusion.needsReview || method === 'statistical_v2'
  const band = args.charCount < SHORT_TEXT_CHARS
    ? `${Math.max(0, fusion.probability - 15)}-${Math.min(SHORT_TEXT_PROB_MAX, fusion.probability + 15)}`
    : undefined

  const warnings: string[] = []
  if (sameFamily) warnings.push(crossModelDetectWarning({ sameFamily: true }) || '同系检测偏差风险')
  if (!(calib.meta.source === 'profile' && calib.meta.version)) warnings.push('ppl 未校准（无 ppl_tracks 档案），S2 暂不计分')
  if (method === 'statistical_v2') warnings.push('参考模型不可用，纯统计融合（护栏下封顶）')
  warnings.push('本站多证据融合检测，启发式，非腾讯朱雀官方分数')

  const result: AiDetectionResult = {
    ...legacy,
    probability: fusion.probability,
    verdict: fusion.verdict,
    confidence: fusion.confidence,
    method,
    signals: buildCompatSignals(legacy.signals, fusion),
    suggestions: (fusion.probability >= 40 || (sameFamily && fusion.s1 == null))
      ? buildAiDetectionSuggestions(trimmed, legacy.signals, { perplexity: refLine?.ppl, probability: fusion.probability, sampledCharCount: raws.char_count })
      : undefined,

    perplexity: refLine?.ppl != null ? Math.round(refLine.ppl * 100) / 100 : undefined,
    mean_logprob: refLine?.meanLogprob != null ? Math.round(refLine.meanLogprob * 1000) / 1000 : undefined,
    perplexity_model: refLine?.model || (refLine ? args.repModel : undefined) || undefined,
    writing_model: args.options.writingModelHint,
    same_family_detect: sameFamily || undefined,
    ai_detect_warning: warnings.filter(Boolean).join('；'),
    sampled_char_count: args.scoredChars || undefined,
    analyzed_tokens: args.analyzedTokens || undefined,
    fallback_reason: args.firstFailure || undefined,
    elapsed_ms: Date.now() - args.started,
    content_hash: hashNovelContent(trimmed),
    detected_at: new Date().toISOString(),
    segments: segs,
    high_band_count: highBandCount,
    sampling: {
      windows: args.windowResults.map((w) => ({
        label: w.label, char_start: w.char_start, char_end: w.char_end,
        perplexity: w.perplexity, probability: w.probability, status: w.status,
      })),
    },
    engine_version: AI_DETECT_ENGINE_VERSION,
    genre: args.genre,
    needs_review: needsReview,
    calibration: refLine ? 'calibrated' : 'none',
    ref_mode: refLine ? (refLine.mode as 'echo' | 'prompt_logprobs' | 'proxy' | 'none') : 'none',
    coverage: { windows_total: args.windowResults.length, windows_scored: args.windowResults.filter((w) => w.status === 'scored').length, scored_chars: args.scoredChars, text_chars: args.charCount },
    evidence: fusion.evidenceLines,
    perturb: args.perturb ? { applied: !!args.perturb.applied, stability: args.perturb.stability ?? null, error: args.perturb.error } : undefined,
    suspected_source: args.fpModel,
    probability_band: band,
  }
  return result
}
function buildCompatSignals(legacy: AiDetectionSignal[], fusion: FusionResult): AiDetectionSignal[] {
  const top = legacy.filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score)
  return [
    { key: 's1_stat', score: fusion.s1 },
    ...(fusion.s2 != null ? [{ key: 's2_reference' as const, score: fusion.s2 }] : [{ key: 's2_reference_missing' as const, score: 0 }]),
    ...(fusion.s3 != null ? [{ key: 's3_fingerprint' as const, score: fusion.s3 }] : []),
    ...(fusion.s5 != null ? [{ key: 's5_adversarial' as const, score: fusion.s5 }] : []),
    ...top,
  ].map((s) => ({ key: s.key, score: Math.round(s.score * 1000) / 1000 }))
}
