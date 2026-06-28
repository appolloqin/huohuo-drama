/**
 * 小说写作服务 — 参考 AI-Writer 的续写逻辑：取文末上下文 + 大纲/前章衔接，一次生成长正文。
 */
import { chatCompletionText, type ChatCompletionOptions, type ChatMessage, type TextBillingContext } from '../ai/ai.js'
import {
  assertValidNovelCreativeOutput,
  NO_THINKING_OUTPUT_RULE,
} from '../../common/novel/novel-creative-output.js'
import {
  WEBNOVEL_CHAPTER_PROSE_GUIDE,
  WEBNOVEL_OUTPUT_FORMAT_REMINDER,
} from '../../agents/webnovel-prose-style.js'
import { NOVEL_OUTLINE_STRUCTURE_HINT, NOVEL_OUTLINE_VOLUME_SECTION, NOVEL_OUTLINE_WORLD_SECTION } from '../../agents/novel-defaults.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { polishNovelChapterProse } from './novel-prose-polish.js'
import { parseNovelMetadata, type NovelMetadata } from '../../common/novel/novel-meta.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { buildNovelWriteContext } from './novel-continuity.js'
import { NOVEL_MEMORY_CHAPTER_END_FORMAT, buildAnchorEchoPromptBlock, ensureAnchor, ensureNovelMemory, resolveVolumeForChapter } from './novel-memory/index.js'
import { CAUSAL_CHAPTER_END_FORMAT, isCausalChainEnabled } from './novel-causal-chain/index.js'
import { parseVolumeRanges, type OutlineVolumeRange, getMaxParsedChapterNumber } from '../../common/novel/novel-outline.js'
import { truncText } from '../../common/drama/project-continuity.js'
import { logTaskWarn } from '../../common/task/task-logger.js'

const MAX_NOVEL_USER_PROMPT_CHARS = 32000

function joinNovelPromptBlocks(blocks: string[]): string {
  const filtered = blocks.filter(Boolean)
  let joined = filtered.join('\n\n')
  if (joined.length <= MAX_NOVEL_USER_PROMPT_CHARS) return joined

  const head = filtered.slice(0, 3).join('\n\n')
  const tail = filtered.slice(-5).join('\n\n')
  const budget = MAX_NOVEL_USER_PROMPT_CHARS - head.length - tail.length - 64
  const middle = filtered.slice(3, -5).join('\n\n')
  const midTrimmed = middle.length > Math.max(budget, 800)
    ? `${middle.slice(0, Math.max(budget, 800))}\n…（前序上下文过长已截断，请以锁定事实与上章摘录为准）`
    : middle
  joined = [head, midTrimmed, tail].filter(Boolean).join('\n\n')
  if (joined.length > MAX_NOVEL_USER_PROMPT_CHARS) {
    logTaskWarn('Novel', 'prompt-truncated', { chars: joined.length })
    joined = `${joined.slice(0, MAX_NOVEL_USER_PROMPT_CHARS)}\n…（上下文已截断）`
  }
  return joined
}

function formatChapterOutlineBlock(chapterOutline: string | undefined, chapterNumber: number): string {
  const trimmed = chapterOutline?.trim()
  if (!trimmed) return ''
  if (chapterNumber >= 2) {
    return `【本章大纲（仅供参考；若与前序已写/锁定事实冲突，须以前序为准）】\n${trimmed}`
  }
  return `【本章大纲】\n${trimmed}`
}

function tailContext(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return text.slice(-maxChars)
}

export async function generateNovelPremise(args: {
  title?: string
  keywords: string
  genre?: string
  totalChapters?: number
}, billing?: TextBillingContext): Promise<string> {
  const { title, keywords, genre, totalChapters } = args
  const system = await buildNovelAgentSystem('novel_premise')
  const options = await novelAgentCompletionOptions('novel_premise', { maxTokens: 2048, temperature: 0.78 })

  const user = [
    title ? `【书名】${title}` : '',
    genre ? `【题材】${genre}` : '',
    totalChapters ? `【计划章数】约 ${totalChapters} 章` : '',
    `【关键词】\n${keywords}`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const premise = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(premise, 'premise')
}

export async function generateNovelWritingBrief(args: {
  keywords: string
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  chapterOutline?: string
  genre?: string
  dramaId?: number
  chapterId?: number
  meta?: NovelMetadata
}, billing?: TextBillingContext): Promise<string> {
  const {
    keywords, dramaTitle, chapterNumber, chapterTitle, chapterOutline, genre,
    dramaId, chapterId, meta,
  } = args
  const system = await buildNovelAgentSystem('novel_writing_brief')
  const options = await novelAgentCompletionOptions('novel_writing_brief', { maxTokens: 4096, temperature: 0.76 })

  const contextBlocks: string[] = []
  if (dramaId && chapterId && meta) {
    const ctx = await buildNovelWriteContext({
      dramaId,
      chapterNumber,
      chapterId,
      meta,
      retrievalQuery: [chapterOutline, keywords].filter(Boolean).join('\n'),
      includeSelfHint: false,
      writingBrief: keywords,
      bookOutline: meta.outline,
    })
    contextBlocks.push(
      chapterNumber === 1 ? ctx.worldbuildingBlock : '',
      chapterNumber === 1 ? ctx.outlineBlock : '',
      ctx.premiseBlock,
      ctx.structuredBlock,
      ctx.continuity,
      ctx.characterBlock,
    )
  }

  const user = [
    ...contextBlocks.filter(Boolean),
    `【书名】${dramaTitle}`,
    genre ? `【题材】${genre}` : '',
    `【本章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    formatChapterOutlineBlock(chapterOutline, chapterNumber),
    `【关键词】\n${keywords}`,
    chapterNumber >= 2
      ? '请输出含【一致性账本】的写作说明；**不得改写前序已锁定的人名与事件**，本章大纲仅作方向参考。'
      : '请输出含【一致性账本】的写作说明；第1章须规划如何自然介绍修炼体系/境界、大陆/地域与门派势力（与【世界观设定】一致）。',
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const brief = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(brief, 'writing_brief', `第${chapterNumber}章`)
}

/** 超过此章数则分卷分批生成分章概要（单次 max_tokens 无法容纳 200+ 章） */
const OUTLINE_PHASED_THRESHOLD = 100

function outlineMaxTokensForChapters(totalChapters: number): number {
  if (totalChapters <= OUTLINE_PHASED_THRESHOLD) return 16384
  return 8192
}

function stripChapterSummarySection(text: string): string {
  const idx = text.search(/\n【分章概要】/)
  return idx >= 0 ? text.slice(0, idx).trim() : text.trim()
}

function mergeOutlineSkeletonAndChapters(skeleton: string, volumeBlocks: OutlineVolumeRange[], parts: string[]): string {
  const base = stripChapterSummarySection(skeleton)
  const body = volumeBlocks.map((vol, i) => {
    const block = (parts[i] || '').trim()
    const header = `--- ${vol.label} ---`
    return block.startsWith('---') ? block : `${header}\n${block}`
  }).filter(Boolean).join('\n\n')
  return `${base}\n\n【分章概要】\n${body}`
}

async function generateOutlineSkeleton(
  args: { title: string; premise: string; genre?: string; totalChapters: number },
  billing?: TextBillingContext,
): Promise<string> {
  const { title, premise, genre, totalChapters } = args
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    NOVEL_OUTLINE_STRUCTURE_HINT,
    '',
    `本次须规划全部 ${totalChapters} 章。`,
    `「${NOVEL_OUTLINE_VOLUME_SECTION}」须连续划分第 1～${totalChapters} 章，各卷范围不重叠、不遗漏。`,
    '**本轮只输出**：世界观设定、总纲、主要人物、分卷设计；**不要输出【分章概要】或任何「第N章」分章行**。',
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: outlineMaxTokensForChapters(totalChapters),
    temperature: 0.7,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【计划章数】${totalChapters}`,
    `【创意/梗概】\n${premise}`,
    `【硬性要求】大纲开头必须是「${NOVEL_OUTLINE_WORLD_SECTION}」，且须含「修炼体系」「大陆/地域」「修真门派/势力」三项；修炼体系用「-」连接完整境界链。须含「${NOVEL_OUTLINE_VOLUME_SECTION}」，每卷写明卷名、章节范围与本卷大纲。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const skeleton = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(skeleton, 'outline_skeleton')
}

async function generateVolumeChapterSummaries(args: {
  skeleton: string
  volume: OutlineVolumeRange
  title: string
  premise: string
  genre?: string
  totalChapters: number
  prevTail?: string
}, billing?: TextBillingContext): Promise<string> {
  const { skeleton, volume, title, premise, genre, totalChapters, prevTail } = args
  const count = volume.end - volume.start + 1
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    `本轮**仅输出**第 ${volume.start}～${volume.end} 章（共 ${count} 章）的分章概要。`,
    '格式：每章一行「第N章：章节标题 / 2～4 句概要，含章末钩子」。',
    '章节号须与分卷设计完全一致，禁止跳号、重复或改写其他卷的章号。',
    '不要输出世界观、总纲、人物、分卷设计；不要前言套话。',
  ].join('\n')

  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: Math.min(16384, Math.max(6144, count * 90)),
    temperature: 0.68,
  })

  const volSeed = volume.blurb
    ? `【本卷规划】\n${volume.blurb}`
    : `【本卷】${volume.label}（第 ${volume.start}～${volume.end} 章）`

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【全书章数】${totalChapters}`,
    `【创意/梗概】\n${premise.slice(0, 1200)}`,
    `【全书骨架 — 分卷须严格遵守】\n${stripChapterSummarySection(skeleton).slice(0, 6000)}`,
    volSeed,
    prevTail ? `【上一卷末章概要 — 须自然衔接】\n${prevTail}` : '',
    `【任务】输出第 ${volume.start} 章～第 ${volume.end} 章分章概要，每章一行；卷末须有高潮或强钩子。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing: billing ? { ...billing, reason: `小说大纲分卷（${volume.start}-${volume.end}章）` } : undefined },
  )
  const trimmed = raw.trim()
  if (!/第\s*\d+\s*章/.test(trimmed)) {
    throw new Error(`分卷「${volume.label}」分章概要生成失败（无章节行），请重试`)
  }
  return trimmed
}

async function generateOutlineChapterTail(args: {
  skeleton: string
  existingOutline: string
  fromChapter: number
  toChapter: number
  title: string
  premise: string
  genre?: string
}, billing?: TextBillingContext): Promise<string> {
  const { skeleton, existingOutline, fromChapter, toChapter, title, premise, genre } = args
  const tailMap = getMaxParsedChapterNumber(existingOutline)
  const lastLine = existingOutline.split('\n').filter(l => /第\s*\d+\s*章/.test(l)).slice(-3).join('\n')

  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    `补全缺失的第 ${fromChapter}～${toChapter} 章分章概要；每章一行，紧接前文剧情。`,
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: Math.min(16384, Math.max(4096, (toChapter - fromChapter + 1) * 90)),
    temperature: 0.68,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【全书骨架】\n${stripChapterSummarySection(skeleton).slice(0, 4000)}`,
    `【已生成分章 — 最大第 ${tailMap} 章】\n${lastLine}`,
    `【任务】续写第 ${fromChapter}～${toChapter} 章，每章一行；写完第 ${toChapter} 章终局/收束。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  return (await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )).trim()
}

export async function generateNovelOutline(args: {
  title: string
  premise: string
  genre?: string
  totalChapters: number
}, billing?: TextBillingContext): Promise<string> {
  const { title, premise, genre, totalChapters } = args

  if (totalChapters <= OUTLINE_PHASED_THRESHOLD) {
    return generateNovelOutlineSingleShot(args, billing)
  }

  const skeleton = await generateOutlineSkeleton(args, billing)
  const volumes = parseVolumeRanges(skeleton, totalChapters)
  const parts: string[] = []
  let prevTail = ''

  for (const vol of volumes) {
    const block = await generateVolumeChapterSummaries({
      skeleton,
      volume: vol,
      title,
      premise,
      genre,
      totalChapters,
      prevTail,
    }, billing)
    parts.push(block)
    prevTail = block.split('\n').filter(l => /第\s*\d+\s*章/.test(l)).slice(-2).join('\n')
  }

  let outline = mergeOutlineSkeletonAndChapters(skeleton, volumes, parts)

  let maxCh = getMaxParsedChapterNumber(outline)
  if (maxCh < totalChapters) {
    logTaskWarn('Novel', 'outline-incomplete-tail', { totalChapters, maxCh })
    const tail = await generateOutlineChapterTail({
      skeleton,
      existingOutline: outline,
      fromChapter: maxCh + 1,
      toChapter: totalChapters,
      title,
      premise,
      genre,
    }, billing)
    outline = `${outline.trim()}\n${tail}`
    maxCh = getMaxParsedChapterNumber(outline)
  }

  return assertValidNovelCreativeOutput(outline, 'outline', undefined, { totalChapters })
}

async function generateNovelOutlineSingleShot(
  args: { title: string; premise: string; genre?: string; totalChapters: number },
  billing?: TextBillingContext,
): Promise<string> {
  const { title, premise, genre, totalChapters } = args
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    NOVEL_OUTLINE_STRUCTURE_HINT,
    '',
    `本次分章概要须覆盖第 1 章～第 ${totalChapters} 章；「${NOVEL_OUTLINE_VOLUME_SECTION}」须划分全部 ${totalChapters} 章，各卷章节范围连续且不遗漏。`,
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: outlineMaxTokensForChapters(totalChapters),
    temperature: 0.7,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【计划章数】${totalChapters}`,
    `【创意/梗概】\n${premise}`,
    `【硬性要求】大纲开头必须是「${NOVEL_OUTLINE_WORLD_SECTION}」，且须含「修炼体系」「大陆/地域」「修真门派/势力」三项；修炼体系用「-」连接完整境界链。须含「${NOVEL_OUTLINE_VOLUME_SECTION}」，每卷写明卷名、章节范围与本卷大纲。分章概要必须写满第 ${totalChapters} 章，不得中途截断。`,
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n\n')

  const outline = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options, billing },
  )
  return assertValidNovelCreativeOutput(outline, 'outline', undefined, { totalChapters })
}

export async function buildContinueNovelMessages(args: {
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  existingText: string
  meta: NovelMetadata
  dramaId: number
  chapterId: number
  lengthHint?: number
}): Promise<{ messages: ChatMessage[]; options: ChatCompletionOptions }> {
  const {
    dramaTitle, chapterNumber, chapterTitle, existingText, meta, dramaId, chapterId, lengthHint = 800,
  } = args

  const ctxChars = Math.min(Math.max(meta.context_chars || 4000, 512), 12000)
  const contextTail = tailContext(existingText, ctxChars)
  const segMin = Math.round(lengthHint * 0.9)
  const segMax = Math.round(lengthHint * 1.15)

  const ctx = await buildNovelWriteContext({
    dramaId,
    chapterNumber,
    chapterId,
    meta,
    retrievalQuery: existingText.slice(-500),
  })

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    WEBNOVEL_CHAPTER_PROSE_GUIDE,
    '',
    '当前任务：**续写**后续内容（只输出新增段落，不要重复已有文字）。',
    `单次续写目标约 ${lengthHint} 字，控制在 ${Math.round(lengthHint * 0.9)}～${Math.round(lengthHint * 1.1)} 字，**不得超过 ${Math.round(lengthHint * 1.15)} 字**。`,
    '排版与口气须与上文一致；段落长短自然变化，带适度语气词。',
    '若提供状态账本或角色表，须严格对齐，禁止吃书。',
    chapterNumber >= 2
      ? '**本章仅依据「本章大纲」+「前序已写章节」**；勿从全书大纲其他章套用未写成的人名或事件。'
      : '',
  ].join('\n')

  let anchorBlock = ''
  if (meta.anchor_echo_enabled !== false) {
    ensureNovelMemory(dramaId, { outline: meta.outline })
    const anchor = await ensureAnchor(dramaId, chapterNumber)
    const vol = resolveVolumeForChapter(meta.outline, chapterNumber)
    anchorBlock = buildAnchorEchoPromptBlock({
      vol, chapter: chapterNumber, anchor, minLen: segMin, maxLen: segMax,
    })
  }

  const blocks = [
    ctx.worldbuildingBlock,
    ctx.outlineBlock,
    ctx.premiseBlock,
    ctx.structuredBlock,
    ctx.continuity,
    ctx.characterBlock,
    ctx.selfHint,
    `【书名】${dramaTitle}`,
    `【当前章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    contextTail
      ? `【待续写上下文（紧接其后继续写）】\n${contextTail}`
      : '【待续写上下文】（本章尚无正文，请写开篇）',
    WEBNOVEL_OUTPUT_FORMAT_REMINDER,
    anchorBlock,
  ].filter(Boolean)

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: joinNovelPromptBlocks(blocks) },
    ],
    options: await novelAgentCompletionOptions('novel_chapter_writer', { maxTokens: 4096, temperature: 0.76 }),
  }
}

export async function continueNovelChapter(
  args: Parameters<typeof buildContinueNovelMessages>[0],
  billing?: TextBillingContext,
): Promise<string> {
  const { messages, options } = await buildContinueNovelMessages(args)
  const draft = await chatCompletionText(messages, { ...options, billing })
  return polishNovelChapterProse(draft, billing, { mode: 'segment' })
}

export async function buildGenerateNovelChapterMessages(args: {
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  prompt: string
  chapterOutline?: string
  meta: NovelMetadata
  dramaId: number
  chapterId: number
  existingText?: string
  targetLength?: number
}): Promise<{ messages: ChatMessage[]; options: ChatCompletionOptions; maxLen: number; minLen: number }> {
  const {
    dramaTitle, chapterNumber, chapterTitle, prompt, chapterOutline, meta, dramaId, chapterId, existingText,
    targetLength = 3000,
  } = args

  const target = Math.min(20000, Math.max(500, targetLength))
  const minLen = Math.round(target * 0.88)
  const maxLen = Math.round(target * 1.08)

  const ctx = await buildNovelWriteContext({
    dramaId,
    chapterNumber,
    chapterId,
    meta,
    retrievalQuery: [chapterOutline, prompt].filter(Boolean).join('\n'),
    writingBrief: prompt,
    bookOutline: meta.outline,
  })

  const tokenCeiling = Math.min(32768, Math.max(8192, Math.round(maxLen * 2)))
  const fallbackOptions = {
    maxTokens: tokenCeiling,
    temperature: 0.72,
  }
  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    WEBNOVEL_CHAPTER_PROSE_GUIDE,
    '',
    meta.long_memory_enabled !== false && !isCausalChainEnabled(meta) ? NOVEL_MEMORY_CHAPTER_END_FORMAT : '',
    isCausalChainEnabled(meta) ? CAUSAL_CHAPTER_END_FORMAT : '',
    '',
    '当前任务：根据**本章大纲**、**前序已写章节**与用户说明，**一次写完**本章正文（长篇章节，非短剧剧本）。',
    `**字数硬性要求**：本章正文目标 ${target} 字，必须写满 ${minLen}～${maxLen} 字，**严禁少于 ${minLen} 字或超过 ${maxLen} 字**；情节完整、有起承转合，篇幅服从字数区间。`,
    '输出小说正文；不要章节标题行、不要作者按语；段落与语气词按人写网文自然变化（初稿后系统会自动润色收口）。',
    isCausalChainEnabled(meta)
      ? '因果链模式：章末须另附【变更记录】元数据块（系统会拆出单独存储，勿插入故事段落中间）。'
      : '',
    chapterNumber >= 2
      ? isCausalChainEnabled(meta)
        ? '**因果链写作**：状态可以变化，但须在章末【变更记录】写清因果；以前序已成文与【因果起点】为准，勿吃书改已发生事件。'
        : '**勿注入全书分章大纲**：已发生事实以前序已写正文与章末账本为准；本章大纲若与之冲突，以前序已写为准。'
      : [
        '**第1章世界观硬性要求**：正文前 1/3 须用 **400～800 字**（分散叙事）展开注入块中的**完整境界链、全部主要地域、至少 2 个门派/势力**；禁止仅用 3～5 句旁白概括带过，禁止自造大纲未列的地名/境界别称。',
        '若提供全书大纲，境界名、地域名、门派名须与「【世界观设定】」一致（如大纲为凝气则不得写炼气）。',
      ].join('\n'),
  ].join('\n')

  const chapterOutlineBlock = formatChapterOutlineBlock(chapterOutline, chapterNumber)

  let anchorBlock = ''
  if (meta.anchor_echo_enabled !== false) {
    ensureNovelMemory(dramaId, { outline: meta.outline })
    const anchor = await ensureAnchor(dramaId, chapterNumber)
    const vol = resolveVolumeForChapter(meta.outline, chapterNumber)
    anchorBlock = buildAnchorEchoPromptBlock({ vol, chapter: chapterNumber, anchor, minLen, maxLen })
  }

  const blocks = [
    ctx.worldbuildingBlock,
    ctx.outlineBlock,
    ctx.premiseBlock,
    ctx.structuredBlock,
    ctx.continuity,
    chapterOutlineBlock,
    ctx.characterBlock,
    ctx.selfHint,
    `【书名】${dramaTitle}`,
    `【本章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    existingText?.trim()
      ? `【本章已有草稿（可融合改写）】\n${truncText(existingText.trim(), 1500)}`
      : '',
    `【写作说明】\n${prompt}`,
    `【篇幅硬性指标】本章正文必须 ${minLen}～${maxLen} 字（目标 ${target} 字），不得超过 ${maxLen} 字，不宜明显短于 ${minLen} 字。`,
    WEBNOVEL_OUTPUT_FORMAT_REMINDER,
    anchorBlock,
  ].filter(Boolean)

  let options = await novelAgentCompletionOptions('novel_chapter_writer', fallbackOptions)
  options = {
    ...options,
    maxTokens: Math.min(tokenCeiling, Math.max(options.maxTokens ?? tokenCeiling, tokenCeiling)),
  }
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: joinNovelPromptBlocks(blocks) },
    ],
    options,
    maxLen,
    minLen,
  }
}

export async function generateNovelChapterFull(
  args: Parameters<typeof buildGenerateNovelChapterMessages>[0],
  billing?: TextBillingContext,
): Promise<string> {
  const { messages, options, minLen, maxLen } = await buildGenerateNovelChapterMessages(args)
  const draft = await chatCompletionText(messages, { ...options, billing })
  return polishNovelChapterProse(draft, billing, { minLen, maxLen, mode: 'chapter' })
}

export function summarizeNovelChapterLength(text: string, minLen: number, maxLen: number) {
  const n = countNovelChars(text)
  return { chars: n, minLen, maxLen, within: n >= minLen && n <= maxLen }
}
