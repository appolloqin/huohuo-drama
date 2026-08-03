/**
 * 章节自动去 AI 味闭环 — 统计检测 + 最多 N 轮检测引导精修
 */
import type { TextBillingContext } from '../ai/ai.js'
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
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { diversifyNovelProseTells } from '../../common/novel/novel-prose-diversify.js'
import {
  isAiHumanizeAutoEnabled,
  resolveAiHumanizeMax,
  resolveAiHumanizeTarget,
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

function toHint(detect: AiDetectionResult): HumanizeDetectionHint {
  return {
    probability: detect.probability,
    verdict: detect.verdict,
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
                ? '用词分布偏模型化：加具体名词与感官细节，少微微/缓缓/猛地等空转'
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
    humanize_attempts: extra.humanize_attempts,
    humanize_passed: extra.humanize_passed,
    humanize_target: extra.humanize_target,
    humanize_warning: extra.humanize_warning,
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
 * 或总分持平但最高维明显下降（常见：段落均匀 80%→28%，总分被其它维抵消）→ 采纳；
 * 分数升高一律拒绝。
 */
export function shouldAcceptHumanizePass(
  beforeProb: number,
  afterProb: number,
  opts?: { beforeTopSignal?: number; afterTopSignal?: number },
): boolean {
  if (afterProb < beforeProb) return true
  if (afterProb > beforeProb) return false
  const beforeTop = opts?.beforeTopSignal
  const afterTop = opts?.afterTopSignal
  if (beforeTop != null && afterTop != null && afterTop <= beforeTop - 0.12) return true
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
  let detect = detectAiText(prose)
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
        const afterDetect = detectAiText(candidate)
        const beforeTop = topSignalScore(detect)
        const afterTop = topSignalScore(afterDetect)
        if (!shouldAcceptHumanizePass(beforeProb, afterDetect.probability, {
          beforeTopSignal: beforeTop,
          afterTopSignal: afterTop,
        })) {
          rejected += 1
          logTaskWarn('Novel', 'ai-humanize-pass-rejected', {
            chapterNumber,
            attempt: attempts,
            before: beforeProb,
            after: afterDetect.probability,
            beforeTop: Math.round(beforeTop * 100),
            afterTop: Math.round(afterTop * 100),
          })
          // 分数未降且主因未松：丢弃本轮
          continue
        }
        prose = diversifyNovelProseTells(candidate)
        detect = detectAiText(prose)
        // 若打散后比采纳前更好或持平则用打散稿；否则用 LLM 稿
        if (detect.probability > afterDetect.probability) {
          prose = candidate
          detect = afterDetect
        }
        accepted += 1
        logTaskWarn('Novel', 'ai-humanize-pass-accepted', {
          chapterNumber,
          attempt: attempts,
          before: beforeProb,
          after: detect.probability,
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
    detect = detectAiText(prose)
  }

  const finalProse = detachChangeRecordForStorage(merged).prose || prose
  const finalDetect = detectAiText(finalProse)
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
