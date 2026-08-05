/**
 * 小说正文润色轮 — 对齐去 AI 味改写第 2 轮（排版收口 + 口语化 + 语气词）。
 * 章节生成/续写在初稿后调用，弥补单次生成的差距。
 */
import {
  WEBNOVEL_HUMAN_PROSE_STYLE,
  WEBNOVEL_POLISH_COLLOQUIAL_BOOST,
  WEBNOVEL_STAT_FINGERPRINT_GUIDE,
} from '../../agents/webnovel-prose-style.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { chatCompletionText, looksLikeModelThinkingLeak, sanitizeModelCreativeOutput, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  isOverFragmentedLayout,
  needsParagraphSplit,
  normalizeNovelParagraphs,
  preserveNovelLineLayout,
  toNaturalNovelParagraphs,
} from '../../common/novel/novel-paragraph-format.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { diversifyNovelProseTells } from '../../common/novel/novel-prose-diversify.js'
import { splitProseAndChangeRecord } from './novel-causal-chain/index.js'
import { stripLengthAdjustInstructionEcho } from '../../common/novel/novel-change-record.js'

/** 按目标字数估算 completion tokens（中文约 1.5～2 字/token，留余量） */
export function chapterLengthTokenBudget(maxLen: number): number {
  const n = Math.max(500, Math.min(20000, Math.round(maxLen)))
  return Math.min(32768, Math.max(1024, Math.round(n * 1.7) + 384))
}

function finalizePolishedProse(draft: string, polished: string, layoutReference?: string): string {
  const trimmedDraft = draft.trim()
  let out = sanitizeModelCreativeOutput(polished.trim()) || trimmedDraft
  out = sanitizeModelCreativeOutput(out) || trimmedDraft
  out = stripLengthAdjustInstructionEcho(out) || out
  if (looksLikeModelThinkingLeak(out) || (/^【任务理解】|^让我仔细分析|^【润色原则】/m.test(out) && !/「/.test(out.slice(0, 500)))) {
    logTaskWarn('Novel', 'prose-polish-thinking-leak', {})
    out = sanitizeModelCreativeOutput(trimmedDraft) || trimmedDraft
  }
  const draftHasBreaks = /\n/.test(trimmedDraft)
  const outHasBreaks = /\n/.test(out)
  if (draftHasBreaks && !outHasBreaks) {
    logTaskWarn('Novel', 'prose-polish-collapsed-breaks', {})
    out = trimmedDraft
  }
  const layoutRef = (layoutReference || trimmedDraft).trim()
  // 过长原稿作 layout 参考会把压缩结果撑回去；仅当参考不显著长于草稿时沿用
  const useLayout = countNovelChars(layoutRef) <= countNovelChars(trimmedDraft) * 1.08
  const restored = useLayout ? preserveNovelLineLayout(layoutRef, out) : out
  if (restored !== out) {
    logTaskWarn('Novel', 'prose-polish-normalized-layout', {})
    out = restored
  } else if (isOverFragmentedLayout(out)) {
    out = toNaturalNovelParagraphs(out)
  } else if (needsParagraphSplit(out)) {
    out = normalizeNovelParagraphs(out)
  }
  return diversifyNovelProseTells(normalizeNovelTemporalNumerals(out))
}

export async function polishNovelChapterProse(
  draft: string,
  billing?: TextBillingContext,
  opts?: {
    minLen?: number
    maxLen?: number
    mode?: 'segment' | 'chapter'
    colloquialBoost?: boolean
    /** 重写时传入原稿，仅作排版参考；过长时勿用于撑篇幅 */
    layoutReference?: string
  },
): Promise<string> {
  const trimmed = draft.trim()
  if (!trimmed) return trimmed

  const { prose, changeBlock } = splitProseAndChangeRecord(trimmed)
  const bodyToPolish = prose || trimmed
  const layoutRef = (opts?.layoutReference || bodyToPolish).trim()
  const charCount = countNovelChars(bodyToPolish)

  const tokenCeiling = opts?.mode === 'segment'
    ? Math.min(8192, Math.max(1536, Math.round(charCount * 1.8) + 256))
    : opts?.maxLen != null
      ? chapterLengthTokenBudget(opts.maxLen)
      : Math.min(16384, Math.max(2048, Math.round(charCount * 1.8) + 256))

  let lengthNote = '篇幅与润色前相当（约 ±12%），禁止明显扩写。'
  if (opts?.mode === 'segment') {
    lengthNote = '这是续写片段，保持与润色前相近字数，勿扩写整章。'
  } else if (opts?.minLen != null && opts?.maxLen != null) {
    const over = charCount > opts.maxLen
    lengthNote = over
      ? `原稿已超上限（当前约 ${charCount} 字，上限 ${opts.maxLen}）：须压缩到 ${opts.minLen}～${opts.maxLen} 字，保留关键情节，禁止跟原稿等长。`
      : `全章篇幅须落在 ${opts.minLen}～${opts.maxLen} 字；禁止超过 ${opts.maxLen} 字。`
  }

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    '当前任务：**润色收口**（对齐去AI味改写第2轮），让正文更接近人写网文，保留全部情节。',
    opts?.colloquialBoost
      ? '本轮为**重写后口语化加码**：优先改书面腔与模板比喻，补语气词与句长参差。'
      : '',
    '**严禁**输出思考过程、任务分析、润色计划、英文、`<memory>` / `<think>` 等标签；只输出润色后的简体中文章节正文。',
  ].filter(Boolean).join('\n')

  const user = [
    '【润色要求】',
    WEBNOVEL_HUMAN_PROSE_STYLE,
    WEBNOVEL_STAT_FINGERPRINT_GUIDE,
    opts?.colloquialBoost ? WEBNOVEL_POLISH_COLLOQUIAL_BOOST : '',
    '- **段落**：叙述每段 1～3 句（硬上限 3），满 3 句必须空行换段；对话/惊觉可一句成段；**严禁**一段塞四五句；极短句勿独占一行',
    '- **时间与金钱数字**：年、月、日、钟点用阿拉伯数字（如 1990年、3月、15日、凌晨3点）；金额用 800元、2000元；「一点/一些」少量义保持汉字；删掉 \`***\` / \`* * *\` 分节符，换场只用空行',
    '- **口语化**：对话用 “……” 补语气词（勿用「」）；压书面腔；删改 AI 套话与「最后/只见/不禁/心中暗道」连用',
    '- **情节与数额**：人物、地名、桥段、因果与已给出的钱数/物件一律保留；禁止加造更大违约金等新代价；' + lengthNote,
    '- **开篇时空**：禁止把开篇改写到早于待润色稿/上章末已发生事实的时空点；情节顺序须保持；补字只加厚已有场面，只改文风与口语',
    changeBlock
      ? '- **章末【变更记录】**：润色时勿输出；系统会原样保留，勿删改'
      : '',
    '- 只输出润色后正文，不要任何说明、分析、英文或思考过程',
    '',
    '【待润色正文】',
    bodyToPolish,
  ].filter(Boolean).join('\n')

  const options = await novelAgentCompletionOptions('novel_chapter_writer', {
    maxTokens: tokenCeiling,
    temperature: opts?.colloquialBoost ? 0.92 : 0.88,
  })
  const maxTokens = Math.min(tokenCeiling, Math.max(768, Number(options.maxTokens) || tokenCeiling))

  try {
    const polished = await chatCompletionText(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { ...options, maxTokens, billing },
    )
    let out = finalizePolishedProse(bodyToPolish, polished, layoutRef)
      + (changeBlock ? `\n\n${changeBlock}` : '')
    if (opts?.mode !== 'segment' && opts?.minLen != null && opts?.maxLen != null) {
      out = await ensureNovelChapterWithinLength(out, opts.minLen, opts.maxLen, billing)
    }
    return out
  } catch (err: any) {
    logTaskWarn('Novel', 'prose-polish-skipped', { error: err?.message || 'empty' })
    const fallback = sanitizeModelCreativeOutput(trimmed) || trimmed
    const laidOut = preserveNovelLineLayout(layoutRef, fallback)
    let out = normalizeNovelTemporalNumerals(laidOut)
    if (opts?.mode !== 'segment' && opts?.minLen != null && opts?.maxLen != null) {
      out = await ensureNovelChapterWithinLength(out, opts.minLen, opts.maxLen, billing)
    }
    return out
  }
}

/**
 * 将正文字数收束到目标区间：超上限压缩，明显不足则补写。
 */
export async function ensureNovelChapterWithinLength(
  text: string,
  minLen: number,
  maxLen: number,
  billing?: TextBillingContext,
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed || !(maxLen > 0) || !(minLen > 0)) return trimmed

  const { prose, changeBlock } = splitProseAndChangeRecord(trimmed)
  let body = prose || trimmed
  const inputBody = body
  let n = countNovelChars(body)
  const maxSoft = Math.round(maxLen * 1.02)
  const minSoft = Math.round(minLen * 0.97)
  if (n <= maxSoft && n >= minSoft) {
    return changeBlock ? `${body}\n\n${changeBlock}` : body
  }

  const over = n > maxSoft
  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    over
      ? '当前任务：将章节正文**压缩到目标字数区间**，保留全部关键情节与人物关系，删注水与重复描写。'
      : '当前任务：将章节正文**补写到目标字数区间**，只在本稿已有场面上加厚冲突、反应与细节；禁止另起更早开篇时空，禁止另起结局。',
    '只输出处理后的完整简体中文正文；禁止输出【硬性字数】【待补写正文】【待压缩正文】等说明标记或任务复述。',
    '输入即待处理正文，勿引入本稿之外的旧稿结构。',
  ].join('\n')

  for (let attempt = 0; attempt < 2; attempt++) {
    n = countNovelChars(body)
    if (n <= maxSoft && n >= minSoft) break
    const stillOver = n > maxSoft
    const stillShort = n < minSoft
    if (!stillOver && !stillShort) break

    const tokenCeiling = chapterLengthTokenBudget(maxLen)
    const user = [
      stillOver
        ? `【硬性字数】须输出 ${minLen}～${maxLen} 字（当前约 ${n} 字，超标须压缩）。保留因果与关键对白；合并重复场面；禁止另起炉灶改结局。`
        : `【硬性字数】须输出 ${minLen}～${maxLen} 字（当前约 ${n} 字，明显偏短须补写到贴近目标）。在原线索上加场面与反应，禁止注水。`,
      '',
      stillOver ? '【待压缩正文】' : '【待补写正文】',
      body,
    ].join('\n')

    try {
      const options = await novelAgentCompletionOptions('novel_chapter_writer', {
        maxTokens: tokenCeiling,
        temperature: stillOver ? 0.55 : 0.72,
      })
      const raw = await chatCompletionText(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        {
          ...options,
          maxTokens: Math.min(tokenCeiling, Number(options.maxTokens) || tokenCeiling),
          billing: billing
            ? { ...billing, reason: stillOver ? `小说章节篇幅压缩（第${attempt + 1}次）` : `小说章节篇幅补写（第${attempt + 1}次）` }
            : undefined,
        },
      )
      const next = finalizePolishedProse(body, raw, body)
      const nextN = countNovelChars(next)
      if (nextN < Math.round(minLen * 0.45)) {
        logTaskWarn('Novel', 'chapter-length-adjust-too-short', { attempt, before: n, after: nextN })
        break
      }
      if (stillOver && nextN >= n) {
        logTaskWarn('Novel', 'chapter-length-compress-noop', { attempt, before: n, after: nextN })
        break
      }
      if (stillShort && nextN <= n) {
        logTaskWarn('Novel', 'chapter-length-expand-noop', { attempt, before: n, after: nextN })
        break
      }
      body = next
    } catch (err: any) {
      logTaskWarn('Novel', 'chapter-length-adjust-failed', { error: err?.message || 'unknown' })
      break
    }
  }

  const finalN = countNovelChars(body)
  const inputN = countNovelChars(inputBody)
  // 补写失败时禁止交比输入更短的稿（MiniMax 空正文/越压越短）
  if (finalN < minSoft && inputN > finalN) {
    logTaskWarn('Novel', 'chapter-length-keep-input', { chars: inputN, failed: finalN, minLen, maxLen })
    body = inputBody
  } else if (finalN > Math.round(maxLen * 1.05) || finalN < Math.round(minLen * 0.9)) {
    logTaskWarn('Novel', 'chapter-length-band-miss', { chars: finalN, minLen, maxLen })
  }
  const { stripIntraChapterNearDuplicate } = await import('./novel-intra-chapter-dedupe.js')
  body = stripIntraChapterNearDuplicate(body).text
  return changeBlock ? `${body.trim()}\n\n${changeBlock}` : body.trim()
}
