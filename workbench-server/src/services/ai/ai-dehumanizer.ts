import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { chatCompletionText, type ChatMessage, type TextBillingContext } from './ai.js'
import { WEBNOVEL_HUMAN_PROSE_STYLE } from '../../agents/webnovel-prose-style.js'
import { buildDehumanizerSystem, dehumanizerCompletionOptions } from './ai-dehumanizer-prompt.js'

const MAX_HUMANIZE_CHARS = 120000

export type HumanizeDetectionHint = {
  probability?: number
  verdict?: string
  signals?: Array<{ key: string; score: number }>
  suggestions?: Array<{
    signal_key?: string
    excerpt?: string
    advice?: string
    match_text?: string
  }>
}

function formatDetectionHints(hints?: HumanizeDetectionHint | null): string {
  if (!hints) return ''
  const lines: string[] = []
  if (hints.probability != null) lines.push(`AI 生成概率约 ${hints.probability}%`)
  if (hints.verdict) lines.push(`判定：${hints.verdict}`)
  if (hints.signals?.length) {
    const top = hints.signals
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(s => `${s.key} ${Math.round(s.score * 100)}%`)
    lines.push(`高发维度：${top.join('、')}`)
  }
  if (hints.suggestions?.length) {
    lines.push('修改建议（句级精修优先）：')
    for (const s of hints.suggestions.slice(0, 12)) {
      const parts = [
        s.signal_key ? `[${s.signal_key}]` : '',
        s.match_text ? `命中「${s.match_text.slice(0, 40)}」` : '',
        s.advice || s.excerpt?.slice(0, 80) || '',
      ].filter(Boolean)
      if (parts.length) lines.push(`- ${parts.join(' ')}`)
    }
  }
  return lines.join('\n')
}

function shouldRunDetectionPass(hints?: HumanizeDetectionHint | null): boolean {
  if (!hints) return false
  if ((hints.probability ?? 0) >= 35) return true
  if ((hints.suggestions?.length ?? 0) > 0) return true
  const topSignal = hints.signals?.reduce((m, s) => Math.max(m, s.score), 0) ?? 0
  return topSignal >= 0.55
}

/** humanize-text Method 2 Round 1 — 节奏扰动（网文散文，忌诗化） */
function buildPass1User(original: string): string {
  return [
    '【第1轮·节奏扰动】（humanize-text Method 2 Round 1）',
    WEBNOVEL_HUMAN_PROSE_STYLE,
    '本轮额外要求：',
    '- **句长**：叙述常见 15–40 字，动作宜干脆，写景可稍长；短句与中句混排，忌 uniform',
    '- 禁止连续 4 句以上句长相近（±5 字）；仅超长句（约 55 字+）或逗号堆叠过多时再拆段内长句',
    '- 打破 AI 均匀节奏；可调整语序/主语位置，模拟翻译链结构扰动（Method 1 精神）',
    '- 降低续写可预测性：少用套路连词，换口语词；勿为去 AI 味而把正常叙述拆成碎片',
    '- 保留全部情节、事实、专有名词；篇幅与原文相当',
    '- 只输出改写后正文',
    '',
    '【待改写正文】',
    original,
  ].join('\n')
}

/** humanize-text Standard Step 2 — 携带 Pass1 历史的二次改写 */
function buildPass2User(): string {
  return [
    '【第2轮·网文排版收口 + 口语化】（Standard Step 2 + Method 2 Round 2）',
    WEBNOVEL_HUMAN_PROSE_STYLE,
    '本轮额外要求：',
    '- **排版**：整理为短段（1～3 句/段），段间空一行；碎句/诗化断行合并成正常段落',
    '- 对话加「……」与口气；关键拟声可独立一行（轰隆——）；书面套话改口语',
    '- 勿回弹 AI 套路句；保留全部信息；只输出改写后正文',
  ].join('\n')
}

/** humanize-text Method 3 — 检测引导句级精修 */
function buildPass3User(pass2: string, hints: string): string {
  return [
    '【第3轮·检测引导精修】（humanize-text Method 3 Detection-Guided）',
    '要求：',
    '- 仅精修仍像 AI 的句子/段落；已自然的部分保持不动',
    '- 优先处理检测建议中的命中片段',
    '- 针对困惑度检测：打散「过于顺滑」的句法；保持散文连贯，勿诗化、勿过度碎句',
    '- 输出完整正文（非 diff）',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    pass2,
  ].filter(Boolean).join('\n')
}

/** 高 AI 率时追加：专门打散 LLM 续写可预测性（对应困惑度 PPL 检测） */
function buildPass4PerplexityUser(text: string): string {
  return [
    '【第4轮·困惑度扰动】',
    '说明：火火 AI 率主要用「同类 LLM 能否轻松续写下文」衡量；PPL 越低越像 AI。本轮在保情节前提下刻意降低可预测性。',
    '要求：',
    '- 打乱最顺的句法：换词、倒装、省略；仍保持网文叙述连贯，严禁诗化碎句',
    '- 替换高频 AI 搭配为不常见但自然的中文；勿造错字、乱码或语义漂移',
    '- 只输出完整正文',
    '',
    '【当前稿】',
    text,
  ].join('\n')
}

function shouldRunPerplexityPass(hints?: HumanizeDetectionHint | null): boolean {
  return (hints?.probability ?? 0) >= 70
}

async function runPass(
  messages: ChatMessage[],
  options: Awaited<ReturnType<typeof dehumanizerCompletionOptions>>,
  billing?: TextBillingContext,
): Promise<string> {
  const text = await chatCompletionText(messages, { ...options, billing })
  return text.trim()
}

export async function humanizeAiText(args: {
  text: string
  detection?: HumanizeDetectionHint | null
}, billing?: TextBillingContext): Promise<{
  content: string
  char_count: number
  pipeline: string
}> {
  const trimmed = args.text.trim()
  if (!trimmed) throw new Error('请输入待改写正文')
  if (countNovelChars(trimmed) > MAX_HUMANIZE_CHARS) {
    throw new Error(`正文过长，单次改写不超过 ${MAX_HUMANIZE_CHARS} 字`)
  }

  const system = await buildDehumanizerSystem()
  const charCount = countNovelChars(trimmed)
  const tokenCeiling = Math.min(16384, Math.max(2048, Math.round(charCount * 2.2)))
  const pass12Options = await dehumanizerCompletionOptions({
    maxTokens: tokenCeiling,
    temperature: 1.05,
  })
  const pass3Options = await dehumanizerCompletionOptions({
    maxTokens: tokenCeiling,
    temperature: 0.82,
  })
  const pass4Options = await dehumanizerCompletionOptions({
    maxTokens: tokenCeiling,
    temperature: 1.15,
  })

  const pipelineSteps: string[] = []

  // Pass 1 — Method 2 R1
  const pass1 = await runPass(
    [
      { role: 'system', content: system },
      { role: 'user', content: buildPass1User(trimmed) },
    ],
    pass12Options,
    billing,
  )
  pipelineSteps.push('method2_round1_burstiness')

  // Pass 2 — Standard history-aware
  const pass2 = await runPass(
    [
      { role: 'system', content: system },
      { role: 'user', content: buildPass1User(trimmed) },
      { role: 'assistant', content: pass1 },
      { role: 'user', content: buildPass2User() },
    ],
    pass12Options,
    billing,
  )
  pipelineSteps.push('standard_step2_history')

  let finalText = pass2
  const hintsStr = formatDetectionHints(args.detection)
  if (shouldRunDetectionPass(args.detection) && hintsStr) {
    finalText = await runPass(
      [
        { role: 'system', content: system },
        { role: 'user', content: buildPass3User(pass2, hintsStr) },
      ],
      pass3Options,
      billing,
    )
    pipelineSteps.push('method3_detection_guided')
  }

  if (shouldRunPerplexityPass(args.detection)) {
    finalText = await runPass(
      [
        { role: 'system', content: system },
        { role: 'user', content: buildPass4PerplexityUser(finalText) },
      ],
      pass4Options,
      billing,
    )
    pipelineSteps.push('perplexity_perturbation')
  }

  return {
    content: finalText,
    char_count: countNovelChars(finalText),
    pipeline: pipelineSteps.join(' → '),
  }
}
