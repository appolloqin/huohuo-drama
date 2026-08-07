/**
 * 章节自动去 AI 味闭环 — 与站内 AI 检测同口径（优先困惑度 PPL，失败回退统计）
 */
import type { TextBillingContext } from '../ai/ai.js'
import { getTextConfigWithModels } from '../ai/ai.js'
import {
  humanizeAiTextDetectionPass,
  MAX_HUMANIZE_CHARS,
  type HumanizeDetectionHint,
} from '../ai/ai-dehumanizer.js'
import {
  AI_DETECTION_METHOD,
  detectAiText,
  type AiDetectionResult,
} from '../ai/ai-text-detection.js'
import {
  detectAiTextStatisticalFallback,
  detectAiTextWithPerplexity,
} from '../ai/ai-perplexity-detection.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { diversifyNovelProseTells } from '../../common/novel/novel-prose-diversify.js'
import {
  crossModelDetectWarning,
  sameFamilyDetect,
} from '../../common/novel/novel-model-family.js'
import {
  isAiHumanizeAutoEnabled,
  resolveAiHumanizeMax,
  resolveAiHumanizeTarget,
  resolvePreferCrossModelDetect,
  type NovelMetadata,
} from '../../common/novel/novel-meta.js'
import {
  mergeEpisodeMetadata,
  type EpisodeAiDetection,
} from '../../common/drama/episode-meta.js'
import { now } from '../../common/http/response.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  detachChangeRecordForStorage,
  ensureCausalChangeRecordAppended,
  isCausalChainEnabled,
} from './novel-causal-chain/index.js'

/** 与 AI 检测页同口径：优先 PPL，失败再统计（避免「统计已过关、界面仍 97%」） */
async function detectForHumanize(
  text: string,
  billing?: TextBillingContext,
): Promise<AiDetectionResult> {
  try {
    return await detectAiTextWithPerplexity(
      text,
      billing
        ? { ...billing, reason: billing.reason || '小说章节 AI 率检测' }
        : undefined,
    )
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : '困惑度检测不可用'
    logTaskWarn('Novel', 'ai-humanize-detect-fallback-statistical', { reason })
    return detectAiTextStatisticalFallback(text, reason)
  }
}

function toHint(detect: AiDetectionResult): HumanizeDetectionHint {
  return {
    probability: detect.probability,
    verdict: detect.verdict,
    perplexity: detect.perplexity,
    signals: detect.signals,
    suggestions: detect.suggestions?.map(s => {
      const advice = s.kind === 'phrase_repetition' && s.match_text
        ? (s.match_text.includes('—')
          ? `破折号「${s.match_text}」约出现 ${s.count || '多'} 次，删减或改为逗号/句号`
          : /[。！？][他她]/.test(s.match_text) || s.match_text === '他' || s.match_text === '。他'
            ? `句首「${s.match_text}」约 ${s.count || '多'} 次：改零主语/人名起句/并句，禁止连续「。他……。他……」`
            : `短语「${s.match_text}」约出现 ${s.count || '多'} 次，换同义或改句式打散`)
        : s.kind === 'paragraph_uniformity'
          ? '连续多段字数过匀：并段或拆出一句成段，做成短拍/中段/稍长交错'
          : s.kind === 'sentence_uniformity'
            ? '连续句长过匀：并短拆长，做成短/中/长交错'
            : s.kind === 'colloquial'
              ? '对话/叙述偏书面，补语气词或更生活化说法'
              : s.kind === 'lexical'
                ? '用词分布偏模型化：加具体名词与感官细节，少微微/缓缓/猛地/四肢百骸/病根等空转'
                : s.kind === 'perplexity'
                  ? '困惑度偏低（同模型好猜）：按检测摘录定点改写邻域，打散可预测句式与空转，勿整章换腔'
                  : undefined
      return {
        signal_key: s.signal_key,
        excerpt: s.excerpt,
        match_text: s.match_text,
        count: s.count,
        advice,
      }
    }),
  }
}

function toEpisodeDetection(
  detect: AiDetectionResult,
  extra: {
    humanize_attempts: number
    humanize_passed: boolean
    humanize_target: number
    humanize_warning?: string
  },
): EpisodeAiDetection {
  const warnParts = [detect.ai_detect_warning, extra.humanize_warning].filter(Boolean)
  return {
    probability: detect.probability,
    confidence: detect.confidence,
    verdict: detect.verdict,
    char_count: detect.char_count,
    content_hash: detect.content_hash,
    detected_at: detect.detected_at,
    signals: detect.signals,
    method: detect.method || AI_DETECTION_METHOD,
    elapsed_ms: detect.elapsed_ms,
    suggestions: detect.suggestions,
    perplexity: detect.perplexity,
    perplexity_model: detect.perplexity_model,
    writing_model: detect.writing_model,
    same_family_detect: detect.same_family_detect,
    ai_detect_warning: detect.ai_detect_warning,
    humanize_attempts: extra.humanize_attempts,
    humanize_passed: extra.humanize_passed,
    humanize_target: extra.humanize_target,
    humanize_warning: warnParts.length ? warnParts.join('；') : undefined,
  }
}

/** C2：标注写作 vs 困惑度模型是否同系（章节统计检测路径也提示） */
async function withCrossModelDetectMeta(
  detect: AiDetectionResult,
  preferCrossModel: boolean,
): Promise<AiDetectionResult> {
  if (detect.same_family_detect != null && detect.writing_model && detect.perplexity_model) {
    return {
      ...detect,
      ai_detect_warning: crossModelDetectWarning({
        sameFamily: !!detect.same_family_detect,
        preferCrossModel,
      }),
    }
  }
  try {
    const { cfg, settings } = await getTextConfigWithModels()
    const writing = cfg.model
    const configured = typeof settings.perplexityModel === 'string' ? settings.perplexityModel.trim() : ''
    const pplModel = configured || writing
    const same = sameFamilyDetect(writing, pplModel)
    const settingsPrefer = settings.preferCrossModelDetect === true
    return {
      ...detect,
      writing_model: writing,
      perplexity_model: pplModel,
      same_family_detect: same,
      ai_detect_warning: crossModelDetectWarning({
        sameFamily: same,
        preferCrossModel: preferCrossModel || settingsPrefer,
      }),
    }
  } catch {
    return detect
  }
}

function mergeProseAndChange(prose: string, changeBlock: string | null): string {
  if (!changeBlock?.trim()) return prose.trim()
  return `${prose.trim()}\n\n${changeBlock.trim()}`
}

/** 最高维信号分（用于总分持平时仍可采纳「打中主因」的改写） */
export function topSignalScore(detect: { signals?: Array<{ score: number }> } | null | undefined): number {
  if (!detect?.signals?.length) return 0
  return detect.signals.reduce((m, s) => Math.max(m, s.score), 0)
}

/**
 * 采纳门：AI 率严格下降 → 采纳；
 * 或总分持平但最高维明显下降 → 采纳；
 * 或 PPL 明显升高（越像人工；概率常顶在 97% 封顶看不出下降）→ 采纳；
 * 分数升高且 PPL 未改善 → 拒绝。
 */
export function shouldAcceptHumanizePass(
  beforeProb: number,
  afterProb: number,
  opts?: {
    beforeTopSignal?: number
    afterTopSignal?: number
    /** 困惑度：数值越高越不像 AI */
    beforePerplexity?: number
    afterPerplexity?: number
  },
): boolean {
  if (afterProb < beforeProb) return true
  if (afterProb > beforeProb) {
    // 概率升了仍可因 PPL 明显变好而采纳（极少见：统计维抖高、PPL 变好）
    if (isPerplexityImproved(opts?.beforePerplexity, opts?.afterPerplexity)) return true
    return false
  }
  // 概率持平（含双双顶在 97%）：看最高维或原始 PPL
  if (isPerplexityImproved(opts?.beforePerplexity, opts?.afterPerplexity)) return true
  const beforeTop = opts?.beforeTopSignal
  const afterTop = opts?.afterTopSignal
  if (beforeTop != null && afterTop != null && afterTop <= beforeTop - 0.12) return true
  return false
}

/** PPL 升高视为变好；绝对 +0.4 或相对 +12% */
export function isPerplexityImproved(before?: number, after?: number): boolean {
  if (before == null || after == null) return false
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return false
  if (after <= before) return false
  if (after - before >= 0.4) return true
  if (after >= before * 1.12) return true
  return false
}

export type NovelAiHumanizeHookResult = {
  content: string
  ai_detection: EpisodeAiDetection | null
  humanize_attempts: number
  humanize_passed: boolean
}

export async function runNovelChapterAiHumanizeHook(args: {
  content: string
  episodeId: number
  chapterNumber: number
  meta: NovelMetadata
  billing?: TextBillingContext
  onProgress?: (status: string) => void
}): Promise<NovelAiHumanizeHookResult> {
  const { episodeId, chapterNumber, meta, billing, onProgress } = args
  let content = args.content.trim()
  if (!content) {
    return { content, ai_detection: null, humanize_attempts: 0, humanize_passed: true }
  }

  if (!isAiHumanizeAutoEnabled(meta)) {
    return { content, ai_detection: null, humanize_attempts: 0, humanize_passed: true }
  }

  const target = resolveAiHumanizeTarget(meta)
  const maxAttempts = resolveAiHumanizeMax(meta)
  const preferCrossModel = resolvePreferCrossModelDetect(meta)
  const detached = detachChangeRecordForStorage(content)
  let prose = detached.prose || content
  let changeBlock = detached.changeBlock
  const charCount = countNovelChars(prose)

  if (charCount < 80) {
    const detect = detectAiText(prose)
    const ai_detection = toEpisodeDetection(detect, {
      humanize_attempts: 0,
      humanize_passed: detect.probability <= target,
      humanize_target: target,
      humanize_warning: '正文过短，跳过自动去 AI 味精修',
    })
    await persistAiDetection(episodeId, ai_detection)
    return {
      content: mergeProseAndChange(prose, changeBlock),
      ai_detection,
      humanize_attempts: 0,
      humanize_passed: !!ai_detection.humanize_passed,
    }
  }

  if (charCount > MAX_HUMANIZE_CHARS) {
    const detect = detectAiText(prose)
    const ai_detection = toEpisodeDetection(detect, {
      humanize_attempts: 0,
      humanize_passed: detect.probability <= target,
      humanize_target: target,
      humanize_warning: `正文超过 ${MAX_HUMANIZE_CHARS} 字，跳过自动去 AI 味精修`,
    })
    await persistAiDetection(episodeId, ai_detection)
    return {
      content: mergeProseAndChange(prose, changeBlock),
      ai_detection,
      humanize_attempts: 0,
      humanize_passed: !!ai_detection.humanize_passed,
    }
  }

  // 润色级同构打散（与数字规范化同类）：先消「了一」机械复读，再检测/精修
  prose = diversifyNovelProseTells(prose)

  onProgress?.('正在检测 AI 痕迹…')
  let detect = await detectForHumanize(prose, billing)
  const baselineProb = detect.probability
  let attempts = 0
  let accepted = 0
  let rejected = 0
  let warning: string | undefined

  if (maxAttempts > 0 && detect.probability > target) {
    while (detect.probability > target && attempts < maxAttempts) {
      attempts += 1
      onProgress?.(`正在降低 AI 痕迹（第 ${attempts}/${maxAttempts} 轮）…`)
      const beforeProb = detect.probability
      const beforeProse = prose
      try {
        const out = await humanizeAiTextDetectionPass(
          { text: prose, detection: toHint(detect) },
          billing
            ? { ...billing, reason: `小说章节去AI味（第${attempts}次）` }
            : undefined,
        )
        const candidate = normalizeNovelTemporalNumerals(out.content.trim() || beforeProse)
        if (!candidate.trim() || candidate.trim() === beforeProse.trim()) {
          rejected += 1
          logTaskWarn('Novel', 'ai-humanize-pass-noop', { chapterNumber, attempt: attempts })
          continue
        }
        const afterDetect = await detectForHumanize(
          candidate,
          billing ? { ...billing, reason: `小说章节去AI味复检（第${attempts}次）` } : undefined,
        )
        const beforeTop = topSignalScore(detect)
        const afterTop = topSignalScore(afterDetect)
        if (!shouldAcceptHumanizePass(beforeProb, afterDetect.probability, {
          beforeTopSignal: beforeTop,
          afterTopSignal: afterTop,
          beforePerplexity: detect.perplexity,
          afterPerplexity: afterDetect.perplexity,
        })) {
          rejected += 1
          logTaskWarn('Novel', 'ai-humanize-pass-rejected', {
            chapterNumber,
            attempt: attempts,
            before: beforeProb,
            after: afterDetect.probability,
            beforePpl: detect.perplexity,
            afterPpl: afterDetect.perplexity,
            beforeTop: Math.round(beforeTop * 100),
            afterTop: Math.round(afterTop * 100),
          })
          // 分数未降且主因未松：丢弃本轮
          continue
        }
        prose = diversifyNovelProseTells(candidate)
        detect = await detectForHumanize(
          prose,
          billing ? { ...billing, reason: `小说章节去AI味打散后复检（第${attempts}次）` } : undefined,
        )
        // 打散后若更差（概率升高，或同概率下 PPL 更差）则回退 LLM 稿
        const diversifyWorse = detect.probability > afterDetect.probability
          || (
            detect.probability === afterDetect.probability
            && isPerplexityImproved(detect.perplexity, afterDetect.perplexity)
          )
        if (diversifyWorse) {
          prose = candidate
          detect = afterDetect
        }
        accepted += 1
        logTaskWarn('Novel', 'ai-humanize-pass-accepted', {
          chapterNumber,
          attempt: attempts,
          before: beforeProb,
          after: detect.probability,
          beforePpl: afterDetect.perplexity,
          afterPpl: detect.perplexity,
          beforeTop: Math.round(beforeTop * 100),
          afterTop: Math.round(topSignalScore(detect) * 100),
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        logTaskWarn('Novel', 'ai-humanize-pass-failed', {
          chapterNumber,
          attempt: attempts,
          error: msg,
        })
        warning = `第 ${attempts} 轮去 AI 味失败：${msg}`
        break
      }
    }
  }

  const passed = detect.probability <= target
  if (!passed && !warning) {
    if (accepted === 0 && attempts > 0) {
      warning = `去 AI 味 ${attempts} 轮均未降低 AI 率（基线 ${baselineProb}% → 仍 ${detect.probability}%），已保留改前正文`
    } else {
      warning = `已改写 ${accepted} 轮仍未压到人工线（当前 ${detect.probability}%，目标 ≤${target}%` +
        (rejected ? `；另有 ${rejected} 轮因分数升高已丢弃` : '') +
        '）'
    }
  }

  let merged = mergeProseAndChange(prose, changeBlock)
  if (isCausalChainEnabled(meta) && !changeBlock) {
    try {
      const ensured = await ensureCausalChangeRecordAppended({
        content: merged,
        chapterNumber,
        billing: billing ? { ...billing, reason: '去AI味后补全变更记录' } : undefined,
      })
      merged = ensured.content
    } catch {
      /* ignore */
    }
  } else if (changeBlock) {
    // 重新 detach 以防模型误输出变更记录
    const again = detachChangeRecordForStorage(merged)
    prose = again.prose || prose
    if (again.changeBlock) changeBlock = again.changeBlock
    merged = mergeProseAndChange(prose, changeBlock)
    detect = await detectForHumanize(
      prose,
      billing ? { ...billing, reason: '小说章节去AI味变更记录后复检' } : undefined,
    )
  }

  const finalProse = detachChangeRecordForStorage(merged).prose || prose
  let finalDetect = await detectForHumanize(
    finalProse,
    billing ? { ...billing, reason: '小说章节去AI味终检' } : undefined,
  )
  finalDetect = await withCrossModelDetectMeta(finalDetect, preferCrossModel)
  const ai_detection = toEpisodeDetection(finalDetect, {
    humanize_attempts: attempts,
    humanize_passed: finalDetect.probability <= target,
    humanize_target: target,
    humanize_warning: warning || (
      finalDetect.probability <= target
        ? undefined
        : `已改写 ${attempts} 轮仍未压到人工线（当前 ${finalDetect.probability}%，目标 ≤${target}%）`
    ),
  })
  await persistAiDetection(episodeId, ai_detection)

  return {
    content: merged,
    ai_detection,
    humanize_attempts: attempts,
    humanize_passed: !!ai_detection.humanize_passed,
  }
}

async function persistAiDetection(episodeId: number, ai_detection: EpisodeAiDetection) {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  const metadata = mergeEpisodeMetadata(ep?.metadata, { ai_detection })
  await episodesRepo.updateEpisode(episodeId, { metadata, updatedAt: now() })
}
