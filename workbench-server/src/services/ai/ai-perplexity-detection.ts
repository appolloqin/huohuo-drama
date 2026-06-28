import {
  promptLogprobs,
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

export const AI_PERPLEXITY_METHOD = 'perplexity_v1' as const
export const AI_STATISTICAL_FALLBACK_METHOD = 'statistical_v1_fallback' as const

const MAX_SAMPLE_CHARS = 3000

function sampleTextForPerplexity(text: string): string {
  const trimmed = text.trim()
  if (countNovelChars(trimmed) <= MAX_SAMPLE_CHARS) return trimmed
  return [...trimmed].slice(0, MAX_SAMPLE_CHARS).join('')
}

/** 将困惑度映射为 AI 生成概率（模型相关，启发式校准） */
export function perplexityToAiProbability(perplexity: number): number {
  if (!Number.isFinite(perplexity) || perplexity <= 0) return 50
  // PPL 越低 → 模型越「熟悉」文本 → 更可能 AI；中心约在 18 附近
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

export async function detectAiTextWithPerplexity(
  text: string,
  billing?: TextBillingContext,
): Promise<AiDetectionResult> {
  const started = Date.now()
  const trimmed = text.trim()
  const charCount = countNovelChars(trimmed)
  const sample = sampleTextForPerplexity(trimmed)
  const sampledCharCount = countNovelChars(sample)

  const options: ChatCompletionOptions = billing ? { billing, temperature: 0 } : { temperature: 0 }
  const { perplexity, tokenCount, meanLogprob, model: perplexityModel } = await promptLogprobs(sample, options)

  const probability = perplexityToAiProbability(perplexity)
  const statistical = detectAiText(trimmed)
  const signals: AiDetectionSignal[] = [
    ...buildPerplexitySignals(perplexity, meanLogprob),
    ...statistical.signals.slice(0, 6),
  ]

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
  }
}

export function detectAiTextStatisticalFallback(
  text: string,
  fallbackReason: string,
): AiDetectionResult {
  const result = detectAiText(text)
  return {
    ...result,
    method: AI_STATISTICAL_FALLBACK_METHOD,
    fallback_reason: fallbackReason,
  }
}
