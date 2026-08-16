/**
 * 困惑度 AI 检测：多窗 PPL + 分段报告（朱雀式体验，非官方分）
 */
import {
  promptLogprobs,
  getTextConfigWithModels,
  type ChatCompletionOptions,
  type TextBillingContext,
} from './ai.js'
import {
  buildAiDetectionSuggestions,
  detectAiText,
  hashNovelContent,
  type AiDetectionResult,
  type AiDetectionSignal,
} from './ai-text-detection.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import {
  crossModelDetectWarning,
  sameFamilyDetect,
} from '../../common/novel/novel-model-family.js'
import {
  AI_DETECT_TOP_K_SEGMENTS,
  bandFromAigc,
  buildStatisticalSegments,
  charWindows,
  countHighBandSegments,
  fuseSegmentAigc,
  windowText,
  type AiDetectSamplingWindow,
  type AiDetectSegment,
} from './ai-detect-segments.js'

export const AI_PERPLEXITY_METHOD = 'perplexity_v1' as const
export const AI_STATISTICAL_FALLBACK_METHOD = 'statistical_v1_fallback' as const

/** @deprecated 保留导出供旧调用；多窗逻辑已取代单头 3k */
export const MAX_SAMPLE_CHARS = 3000

/** 将困惑度映射为 AI 生成概率（模型相关，启发式校准） */
export function perplexityToAiProbability(perplexity: number): number {
  if (!Number.isFinite(perplexity) || perplexity <= 0) return 50
  const score = 100 / (1 + Math.exp((perplexity - 18) / 4))
  return Math.round(Math.min(97, Math.max(4, score)))
}

function verdictFromProbability(probability: number): AiDetectionResult['verdict'] {
  if (probability >= 65) return 'likely_ai'
  if (probability >= 40) return 'mixed'
  return 'likely_human'
}

function confidenceFromCharCount(charCount: number): AiDetectionResult['confidence'] {
  if (charCount < 300) return 'low'
  if (charCount < 800) return 'medium'
  return 'high'
}

function buildPerplexitySignals(perplexity: number, meanLogprob: number): AiDetectionSignal[] {
  const aiScore = perplexityToAiProbability(perplexity) / 100
  return [
    { key: 'perplexity', score: aiScore },
    { key: 'mean_logprob', score: Math.min(1, Math.max(0, (-meanLogprob + 2) / 4)) },
  ]
}

async function runWindowPpl(
  text: string,
  w: AiDetectSamplingWindow,
  options: ChatCompletionOptions,
): Promise<AiDetectSamplingWindow & { mean_logprob?: number; tokens?: number; model?: string }> {
  const sample = windowText(text, w)
  if (countNovelChars(sample) < 40) return { ...w }
  try {
    const { perplexity, tokenCount, meanLogprob, model } = await promptLogprobs(sample, options)
    return {
      ...w,
      perplexity: Math.round(perplexity * 100) / 100,
      probability: perplexityToAiProbability(perplexity),
      mean_logprob: meanLogprob,
      tokens: tokenCount,
      model,
    }
  } catch {
    return { ...w }
  }
}

export async function detectAiTextWithPerplexity(
  text: string,
  billing?: TextBillingContext,
): Promise<AiDetectionResult> {
  const started = Date.now()
  const trimmed = text.trim()
  const charCount = countNovelChars(trimmed)
  const options: ChatCompletionOptions = billing ? { billing, temperature: 0 } : { temperature: 0 }

  const windowsSpec = charWindows(trimmed)
  const windowResults: Array<AiDetectSamplingWindow & { mean_logprob?: number; tokens?: number; model?: string }> = []
  for (const w of windowsSpec) {
    windowResults.push(await runWindowPpl(trimmed, w, options))
  }

  const scoredWindows = windowResults.filter((w) => w.probability != null && w.perplexity != null)
  if (!scoredWindows.length) {
    throw new Error('多窗困惑度检测均失败')
  }

  // 保守：取各窗 AI 概率最大值
  scoredWindows.sort((a, b) => (b.probability || 0) - (a.probability || 0))
  const best = scoredWindows[0]!
  const probability = best.probability!
  const perplexity = best.perplexity!
  const meanLogprob = best.mean_logprob ?? 0
  const tokenCount = windowResults.reduce((a, w) => a + (w.tokens || 0), 0)
  const perplexityModel = best.model
  const sampledCharCount = windowResults.reduce(
    (a, w) => a + countNovelChars(windowText(trimmed, w)),
    0,
  )

  let segments: AiDetectSegment[] = buildStatisticalSegments(trimmed)
  const topK = segments
    .slice()
    .sort((a, b) => b.aigc - a.aigc)
    .filter((s) => countNovelChars(s.text || '') >= 80)
    .slice(0, AI_DETECT_TOP_K_SEGMENTS)

  for (const seg of topK) {
    const body = seg.text || trimmed.slice(seg.char_start, seg.char_end)
    try {
      const { perplexity: segPpl } = await promptLogprobs(body, options)
      const pplProb = perplexityToAiProbability(segPpl)
      const aigc = fuseSegmentAigc(seg.aigc, pplProb)
      seg.aigc = aigc
      seg.probability = Math.round(aigc * 100)
      seg.band = bandFromAigc(aigc)
      seg.perplexity = Math.round(segPpl * 100) / 100
    } catch {
      // 段 PPL 失败保留统计分
    }
  }

  // 去掉落库用大字段前保留 text 供 UI；API 可返回 text（截断）
  segments = segments.map((s) => ({
    ...s,
    text: s.text && s.text.length > 160 ? `${s.text.slice(0, 160)}…` : s.text,
  }))

  const statistical = detectAiText(trimmed)
  const signals: AiDetectionSignal[] = [
    ...buildPerplexitySignals(perplexity, meanLogprob),
    ...statistical.signals.slice(0, 6),
  ]

  let writingModel: string | undefined
  let sameFamily: boolean | undefined
  let aiDetectWarning: string | undefined
  try {
    const { cfg } = await getTextConfigWithModels()
    writingModel = cfg.model
    if (writingModel && perplexityModel) {
      sameFamily = sameFamilyDetect(writingModel, perplexityModel)
      aiDetectWarning = crossModelDetectWarning({ sameFamily })
    }
  } catch {
    // 配置不可用时跳过同系标注
  }

  if (!aiDetectWarning) {
    aiDetectWarning = '本站启发式检测（多窗困惑度+分段），非腾讯朱雀官方分数'
  } else {
    aiDetectWarning = `${aiDetectWarning}；本站启发式，非朱雀官方分`
  }

  return {
    probability,
    confidence: confidenceFromCharCount(charCount),
    verdict: verdictFromProbability(probability),
    char_count: charCount,
    content_hash: hashNovelContent(trimmed),
    detected_at: new Date().toISOString(),
    signals,
    suggestions: buildAiDetectionSuggestions(trimmed, signals, {
      perplexity,
      probability,
      sampledCharCount,
    }),
    method: AI_PERPLEXITY_METHOD,
    elapsed_ms: Date.now() - started,
    perplexity: Math.round(perplexity * 100) / 100,
    mean_logprob: Math.round(meanLogprob * 1000) / 1000,
    analyzed_tokens: tokenCount,
    sampled_char_count: sampledCharCount,
    perplexity_model: perplexityModel,
    writing_model: writingModel,
    same_family_detect: sameFamily,
    ai_detect_warning: aiDetectWarning,
    segments,
    sampling: {
      windows: windowResults.map(({ label, char_start, char_end, perplexity: p, probability: pr }) => ({
        label,
        char_start,
        char_end,
        perplexity: p,
        probability: pr,
      })),
    },
    high_band_count: countHighBandSegments(segments),
  }
}

export function detectAiTextStatisticalFallback(
  text: string,
  fallbackReason: string,
): AiDetectionResult {
  const result = detectAiText(text)
  const segments = buildStatisticalSegments(text).map((s) => ({
    ...s,
    text: s.text && s.text.length > 160 ? `${s.text.slice(0, 160)}…` : s.text,
  }))
  return {
    ...result,
    method: AI_STATISTICAL_FALLBACK_METHOD,
    fallback_reason: fallbackReason,
    segments,
    high_band_count: countHighBandSegments(segments),
    ai_detect_warning: '本站统计启发式（困惑度不可用），非腾讯朱雀官方分数',
  }
}
