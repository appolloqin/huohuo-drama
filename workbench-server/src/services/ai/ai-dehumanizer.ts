import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { chatCompletionText, type ChatMessage, type TextBillingContext } from './ai.js'
import { WEBNOVEL_HUMAN_PROSE_STYLE, WEBNOVEL_STAT_FINGERPRINT_GUIDE } from '../../agents/webnovel-prose-style.js'
import { buildDehumanizerSystem, dehumanizerCompletionOptions } from './ai-dehumanizer-prompt.js'
import { collectNameCoveredBigrams } from './ai-text-detection.js'

export const MAX_HUMANIZE_CHARS = 120000

export type HumanizeDetectionHint = {
  probability?: number
  verdict?: string
  signals?: Array<{ key: string; score: number }>
  suggestions?: Array<{
    signal_key?: string
    excerpt?: string
    advice?: string
    match_text?: string
    count?: number
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
        s.count != null ? `约 ${s.count} 次` : '',
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
    WEBNOVEL_STAT_FINGERPRINT_GUIDE,
    '本轮额外要求：',
    '- **句长**：叙述常见 15–40 字，动作宜干脆，写景可稍长；短句与中句混排，忌 uniform',
    '- 禁止连续 3 句以上句长相近（±5 字）；仅超长句（约 55 字+）或逗号堆叠过多时再拆段内长句',
    '- **段落**：短拍/中段/稍长交错，禁止连续多段字数接近',
    '- **用词**：补具体名词与感官，少抽象副词空转',
    '- **短语**：打散「了一/——/。他」等高复读',
    '- 改动幅度宜小，勿整章换腔；保留情节与专名；篇幅相当',
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
    '- **排版**：短段（1～3 句/段）且段长要参差；段间空一行；碎句/诗化断行合并成正常段落',
    '- 对话用中文双引号 “……” 适度补口气（勿用「」）；书面套话改口语',
    '- 勿为「更口语」整章重写；保留全部信息；只输出改写后正文',
  ].join('\n')
}

/** humanize-text Method 3 — 检测引导句级精修（章节自动闭环主用） */
function buildPass3User(pass2: string, hints: string): string {
  return [
    '【第3轮·检测引导精修】（Method 3 · 保守句级）',
    '硬性约束：',
    '- **外科手术式**：只改检测建议命中的句子/邻近 1～2 句；其余原文逐字保留',
    '- **禁止整章换写**：若建议未覆盖的段落读起来自然，原样输出',
    '- 改动目标是消掉建议里的复读/书面腔；勿用另一套机械句式（如通篇零主语短句、通篇堆语气词）替代',
    '- 针对建议举例：破折号过多→该句改逗号/承接；「了一」同构过多→该处换说法；连续「。他」→仅打散相邻几句主语，勿全文删「他」',
    '- 保留情节、专名、钱数/物件；篇幅约 ±8%；对话仍用 “……”',
    '- 只输出完整正文（非 diff），勿输出【变更记录】',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    pass2,
  ].filter(Boolean).join('\n')
}

/** 短语重复专项 */
function buildPass3PhraseRepetitionUser(
  text: string,
  matchText: string,
  count: number | undefined,
  hints: string,
): string {
  const targetKeep = Math.min(3, Math.max(2, Math.ceil((count || 10) * 0.25)))
  return [
    '【专项·短语重复】',
    `命中「${matchText}」约 ${count ?? '多'} 次 → 须降到 ${targetKeep} 次以内。`,
    `- 含该短语的句子多数换说法；其余句子逐字不动`,
    '- **禁止改人名/地名专名**；专名复现不是本项目标',
    '- 禁止整章重写、另造情节、堆语气词',
    '- 只输出完整正文',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    text,
  ].filter(Boolean).join('\n')
}

/** 句长均匀专项 */
function buildPass3SentenceUniformityUser(text: string, hints: string, excerpt?: string): string {
  return [
    '【专项·句长均匀度】',
    '问题：连续多句长度过于接近，像流水账。',
    '做法（只动均匀段，其余不动）：',
    '- 把过短相邻句并成一句，或把过长句在自然停顿处拆开',
    '- 故意形成短（十余字）/中/偶长交错；禁止拆成诗化一行一句',
    excerpt ? `- 优先处理附近：${excerpt.slice(0, 80)}` : '',
    '- 保留情节与专名；只输出完整正文',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    text,
  ].filter(Boolean).join('\n')
}

/** 用词分布专项 */
function buildPass3LexicalUser(text: string, hints: string, excerpt?: string): string {
  return [
    '【专项·用词分布】',
    '问题：用词偏模型化（过密抽象词或过稀空转）。',
    '做法（只改摘录附近与明显空泛句，其余不动）：',
    '- 换成/补上具体名词、物件、气味、触感、声响；少用微微/缓缓/猛地/似乎/仿佛空转',
    '- 同一动作换不同动词，勿全程「看/走/拿」',
    '- 勿注水、勿改情节结局',
    excerpt ? `- 优先处理附近：${excerpt.slice(0, 80)}` : '',
    '- 只输出完整正文',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    text,
  ].filter(Boolean).join('\n')
}

/** 段落均匀专项（检测最高发维之一） */
function buildPass3ParagraphUniformityUser(text: string, hints: string, excerpt?: string): string {
  return [
    '【专项·段落均匀度】',
    '问题：连续多段字数接近、结构板正，像模板切段。',
    '做法（主要改分段，少改正文措辞）：',
    '- 故意做成短拍（1 句成段）/ 中段（2 句）/ 稍长（3 句）交错；禁止连续 ≥4 段字数差不多',
    '- 可把两段并一段，或把一段里的收束句拆成独立短段；对话/惊觉/拟声优先一句成段',
    '- 仍遵守每段最多 3 句；勿诗化一句一行刷屏',
    '- 勿改情节、专名与钱数物件',
    excerpt ? `- 优先处理附近：${excerpt.slice(0, 80)}` : '',
    '- 只输出完整正文',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    text,
  ].filter(Boolean).join('\n')
}

/** 口语化专项 */
function buildPass3ColloquialUser(text: string, hints: string, excerpt?: string): string {
  return [
    '【专项·口语化程度】',
    '问题：叙述/对话偏书面，语气词偏少，读起来像说明书。',
    '做法（只改偏书面句与对白，其余不动）：',
    '- 对白补自然口气（吧/呢/啊/嗯/啧/嘿/唉），仍用中文双引号 “……”',
    '- 旁白改成更生活化短句或动作接动作；少工整长喻与排比',
    '- 勿通篇堆语气词；勿改情节结局',
    excerpt ? `- 优先处理附近：${excerpt.slice(0, 80)}` : '',
    '- 只输出完整正文',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    text,
  ].filter(Boolean).join('\n')
}

/** 衔接词/套路表达专项 */
function buildPass3TransitionUser(text: string, hints: string, excerpt?: string): string {
  return [
    '【专项·衔接词/套路表达】',
    '问题：紧接着/忍不住/微微/缓缓/仿佛/不禁/嘴角微微等 AI 套路词。',
    '做法（只改命中句，其余不动）：',
    '- 删掉或换成具体动作/心理（如「紧接着」→直接写下一动作；「微微发抖」→「肩头抖了一下」）',
    '- 禁止用另一套空转词替换（勿「微微」改「轻轻」后又堆「缓缓」）',
    '- 勿改情节与专名',
    excerpt ? `- 优先处理附近：${excerpt.slice(0, 80)}` : '',
    '- 只输出完整正文',
    '',
    hints ? `【AI 检测参考】\n${hints}` : '',
    '',
    '【当前稿】',
    text,
  ].filter(Boolean).join('\n')
}

function pickTopSignalKey(hints?: HumanizeDetectionHint | null): string | null {
  if (!hints?.signals?.length) return null
  const top = hints.signals.slice().sort((a, b) => b.score - a.score)[0]
  if (!top || top.score < 0.45) return null
  return top.key
}

function pickPhraseRepetitionTarget(
  hints?: HumanizeDetectionHint | null,
  sourceText?: string,
): {
  match_text: string
  count?: number
} | null {
  const nameBigrams = sourceText ? collectNameCoveredBigrams(sourceText) : new Set<string>()
  const hit = hints?.suggestions?.find(s => {
    if (s.signal_key !== 'phrase_repetition' || !s.match_text?.trim()) return false
    // 禁止把人名覆盖的二字组当精修目标（检测侧已过滤；此处双保险）
    if (nameBigrams.has(s.match_text.trim())) return false
    return true
  })
  if (!hit?.match_text) return null
  return { match_text: hit.match_text, count: hit.count }
}

function pickSuggestionExcerpt(hints: HumanizeDetectionHint | null | undefined, signalKey: string): string | undefined {
  return hints?.suggestions?.find(s => s.signal_key === signalKey)?.excerpt
}

function buildDetectionPassUser(text: string, hints: HumanizeDetectionHint | null | undefined): string {
  const hintsStr = formatDetectionHints(hints) || '（无结构化建议：按统计指纹轻修，其余不动）'
  const phrase = pickPhraseRepetitionTarget(hints, text)
  const top = pickTopSignalKey(hints)

  const transitionScore = hints?.signals?.find(s => s.key === 'transition_patterns')?.score ?? 0
  const hasTransitionHit = !!hints?.suggestions?.some(s => s.signal_key === 'transition_patterns')

  // 段落均匀常为最高维却此前无专项 → 优先打散分段
  if (top === 'paragraph_uniformity') {
    return buildPass3ParagraphUniformityUser(
      text,
      hintsStr,
      pickSuggestionExcerpt(hints, 'paragraph_uniformity'),
    )
  }
  // 衔接词命中时优先（即使用词分布更高——否则会一直改词库而留下「紧接着/微微」）
  if (top === 'transition_patterns' || (hasTransitionHit && transitionScore >= 0.38)) {
    return buildPass3TransitionUser(
      text,
      hintsStr,
      pickSuggestionExcerpt(hints, 'transition_patterns'),
    )
  }
  // 短语重复有明确命中时优先专项（即使总分不是最高）
  if (phrase && (top === 'phrase_repetition' || (phrase.count != null && phrase.count >= 4))) {
    return buildPass3PhraseRepetitionUser(text, phrase.match_text, phrase.count, hintsStr)
  }
  if (top === 'colloquial_markers') {
    return buildPass3ColloquialUser(text, hintsStr, pickSuggestionExcerpt(hints, 'colloquial_markers'))
  }
  if (top === 'sentence_uniformity') {
    return buildPass3SentenceUniformityUser(text, hintsStr, pickSuggestionExcerpt(hints, 'sentence_uniformity'))
  }
  if (top === 'lexical_pattern') {
    return buildPass3LexicalUser(text, hintsStr, pickSuggestionExcerpt(hints, 'lexical_pattern'))
  }
  if (phrase) {
    return buildPass3PhraseRepetitionUser(text, phrase.match_text, phrase.count, hintsStr)
  }
  return buildPass3User(text, hintsStr)
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

/**
 * 章节自动闭环用：仅跑检测引导精修（Pass3），不跑 Pass1/2。
 * 调用方自行决定是否进入本轮（不套用 shouldRunDetectionPass）。
 */
export async function humanizeAiTextDetectionPass(
  args: { text: string; detection?: HumanizeDetectionHint | null },
  billing?: TextBillingContext,
): Promise<{ content: string; char_count: number }> {
  const trimmed = args.text.trim()
  if (!trimmed) throw new Error('请输入待改写正文')
  if (countNovelChars(trimmed) > MAX_HUMANIZE_CHARS) {
    throw new Error(`正文过长，单次改写不超过 ${MAX_HUMANIZE_CHARS} 字`)
  }

  const system = await buildDehumanizerSystem()
  const charCount = countNovelChars(trimmed)
  const tokenCeiling = Math.min(16384, Math.max(2048, Math.round(charCount * 2.2)))
  const options = await dehumanizerCompletionOptions({
    maxTokens: tokenCeiling,
    // 章节精修宜稳：高温易整章漂移、AI 率反升
    temperature: 0.55,
  })
  const content = await runPass(
    [
      { role: 'system', content: system },
      { role: 'user', content: buildDetectionPassUser(trimmed, args.detection) },
    ],
    options,
    billing,
  )
  if (!content.trim()) throw new Error('去 AI 味精修返回空正文')
  return { content, char_count: countNovelChars(content) }
}
