/**
 * 小说正文润色轮 — 对齐去 AI 味改写第 2 轮（排版收口 + 口语化 + 语气词）。
 * 章节生成/续写在初稿后调用，弥补单次生成的差距。
 */
import { WEBNOVEL_HUMAN_PROSE_STYLE } from '../../agents/webnovel-prose-style.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { chatCompletionText, looksLikeModelThinkingLeak, sanitizeModelCreativeOutput, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import { needsParagraphSplit, normalizeNovelParagraphs } from '../../common/novel/novel-paragraph-format.js'
import { splitProseAndChangeRecord } from './novel-causal-chain/index.js'

function finalizePolishedProse(draft: string, polished: string): string {
  const trimmedDraft = draft.trim()
  let out = sanitizeModelCreativeOutput(polished.trim()) || trimmedDraft
  if (looksLikeModelThinkingLeak(out) || (/^【任务理解】|^让我仔细分析|^【润色原则】/m.test(out) && !/「/.test(out.slice(0, 500)))) {
    logTaskWarn('Novel', 'prose-polish-thinking-leak', {})
    out = trimmedDraft
  }
  const draftHasBreaks = /\n/.test(trimmedDraft)
  const outHasBreaks = /\n/.test(out)
  if (draftHasBreaks && !outHasBreaks) {
    logTaskWarn('Novel', 'prose-polish-collapsed-breaks', {})
    return trimmedDraft
  }
  if (needsParagraphSplit(out)) return normalizeNovelParagraphs(out)
  return out
}

export async function polishNovelChapterProse(
  draft: string,
  billing?: TextBillingContext,
  opts?: { minLen?: number; maxLen?: number; mode?: 'segment' | 'chapter' },
): Promise<string> {
  const trimmed = draft.trim()
  if (!trimmed) return trimmed

  const { prose, changeBlock } = splitProseAndChangeRecord(trimmed)
  const bodyToPolish = prose || trimmed
  const charCount = countNovelChars(bodyToPolish)
  const tokenCeiling = Math.min(16384, Math.max(2048, Math.round(charCount * 2.2)))

  let lengthNote = '篇幅与润色前相当（约 ±12%）。'
  if (opts?.mode === 'segment') {
    lengthNote = '这是续写片段，保持与润色前相近字数，勿扩写整章。'
  } else if (opts?.minLen != null && opts?.maxLen != null) {
    lengthNote = `全章篇幅须仍在 ${opts.minLen}～${opts.maxLen} 字区间（约 ±8%）。`
  }

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    '当前任务：**润色收口**（对齐去AI味改写第2轮），让正文更接近人写网文，保留全部情节。',
    '**严禁**输出思考过程、任务分析、润色计划、markdown 标题或 `<think>` 等标签；只输出润色后的章节正文。',
  ].join('\n')

  const user = [
    '【润色要求】',
    WEBNOVEL_HUMAN_PROSE_STYLE,
    '- **段落**：长短自然变化；勿每段固定 4 句，勿一句一段；**段间必须空一行**',
    '- **口语化**：补充合适语气词、对话口气、「……」；把书面套话改口语，勿回弹 AI 套路',
    '- **情节**：人物、地名、桥段、因果一律保留；' + lengthNote,
    changeBlock
      ? '- **章末【变更记录】**：润色时勿输出；系统会原样保留，勿删改'
      : '',
    '- 只输出润色后正文，不要任何说明、分析或思考过程',
    '',
    '【待润色正文】',
    bodyToPolish,
  ].filter(Boolean).join('\n')

  const options = await novelAgentCompletionOptions('novel_chapter_writer', {
    maxTokens: tokenCeiling,
    temperature: 0.88,
  })

  try {
    const polished = await chatCompletionText(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { ...options, billing },
    )
    return finalizePolishedProse(bodyToPolish, polished) + (changeBlock ? `\n\n${changeBlock}` : '')
  } catch (err: any) {
    if (err?.message?.includes('未返回正文')) {
      logTaskWarn('Novel', 'prose-polish-skipped', { error: err?.message || 'empty' })
      return needsParagraphSplit(trimmed) ? normalizeNovelParagraphs(trimmed) : trimmed
    }
    throw err
  }
}
