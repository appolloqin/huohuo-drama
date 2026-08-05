/**
 * 章缝回放开篇修正：替换前 ~1400 字，保留后文。
 * 禁止再把上章末原文整段塞进模型（会诱发照抄）；命中后必须以确定性清洗收口。
 */
import { chatCompletionText, sanitizeModelCreativeOutput, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { detectChapterSeamReplay, stripSeamReplayOpening } from './novel-chapter-seam.js'
import { loadPrevChapterContentTail } from './novel-continuity.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { mergeOrphanShortParagraphs } from '../../common/novel/novel-paragraph-format.js'

const OPENING_CHARS = 1400

function forbiddenSnippets(prevTail: string): string {
  const tip = prevTail.trim().slice(-700)
  const parts = tip
    .split(/(?<=[。！？…])\s*/)
    .map(s => s.trim())
    .filter(s => [...s].length >= 12)
    .slice(-4)
  if (!parts.length) return ''
  return [
    '【严禁沿用的上章末词组/收束句】',
    ...parts.map((s, i) => `${i + 1}. ${s.slice(0, 70)}${s.length > 70 ? '…' : ''}`),
    '开篇不得复述、扩写或换皮重写以上条目。',
  ].join('\n')
}

export async function maybeFixChapterSeamOpening(args: {
  content: string
  dramaId: number
  chapterNumber: number
  billing?: TextBillingContext
  chapterOutline?: string
}): Promise<{ content: string; fixed: boolean }> {
  const { dramaId, chapterNumber, billing, chapterOutline } = args
  let content = args.content.trim()
  if (chapterNumber < 2 || !content) return { content, fixed: false }

  const prevTail = await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
  const hit = detectChapterSeamReplay({
    content,
    chapterNumber,
    prevChapterTail: prevTail,
    chapterOutline,
  })
  if (!hit) return { content, fixed: false }

  // 先确定性清洗（不依赖模型）
  const purged0 = stripSeamReplayOpening({
    content,
    chapterNumber,
    prevChapterTail: prevTail,
    chapterOutline,
  })
  if (purged0.stripped) {
    content = purged0.text
    const afterPurge = detectChapterSeamReplay({
      content,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    if (!afterPurge || (afterPurge.rule === 'chapter_seam_replay' && !/高度重合/.test(afterPurge.message))) {
      logTaskWarn('Novel', 'seam-opening-purged-only', { chapterNumber })
      return { content, fixed: true }
    }
  }

  const cut = Math.min(OPENING_CHARS, Math.max(600, Math.floor(content.length * 0.28)))
  const head = content.slice(0, cut)
  const rest = content.slice(cut)
  if (!rest.trim()) {
    // 无后文可接：只返回清洗结果
    return { content, fixed: purged0.stripped }
  }

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    '当前任务：只改写【开篇片段】，消除章缝回放。',
    '硬性：从上章已发生事实**之后**起笔；轻锚最多一句；禁止重演上章末对白/场面；立刻进入本章新信息。',
    '禁止照抄【严禁沿用】列表中的词组。',
    '篇幅与开篇片段相近（约 ±20%）；只输出开篇替换正文，不要后文、不要说明。',
  ].join('\n')

  const user = [
    hit.message,
    '',
    // 故意不 dump 上章末全文，避免照抄诱饵
    forbiddenSnippets(prevTail),
    chapterOutline?.trim()
      ? `\n【本章大纲（前段）】\n${chapterOutline.trim().slice(0, 400)}`
      : '',
    '',
    `【待改开篇（须重写）】\n${head}`,
    '',
    '【后文开头（勿重复，衔接即可）】',
    rest.slice(0, 280),
  ].filter(Boolean).join('\n')

  try {
    const options = await novelAgentCompletionOptions('novel_chapter_writer', {
      maxTokens: Math.min(4096, Math.max(1024, Math.round(cut * 2.2))),
      temperature: 0.55,
    })
    const raw = await chatCompletionText(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      {
        ...options,
        billing: billing ? { ...billing, reason: '小说章缝开篇修正' } : undefined,
      },
    )
    const opening = mergeOrphanShortParagraphs(
      normalizeNovelTemporalNumerals(sanitizeModelCreativeOutput(raw) || ''),
    )
    if ([...opening].length < 80) {
      logTaskWarn('Novel', 'seam-opening-fix-too-short', { chapterNumber })
      return { content, fixed: purged0.stripped }
    }
    const sep = rest.startsWith('\n') ? '' : '\n\n'
    let next = `${opening.trim()}${sep}${rest}`
    const purged = stripSeamReplayOpening({
      content: next,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    next = purged.text
    const still = detectChapterSeamReplay({
      content: next,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    if (still && /高度重合/.test(still.message)) {
      logTaskWarn('Novel', 'seam-opening-fix-still-hit-after-purge', { chapterNumber })
      // 仍高度重合：退回仅清洗稿（若有），否则采用 next（至少剥过）
      return { content: purged0.stripped ? purged0.text : next, fixed: true }
    }
    return { content: next, fixed: true }
  } catch (err: any) {
    logTaskWarn('Novel', 'seam-opening-fix-failed', {
      chapterNumber,
      error: err?.message || 'unknown',
    })
    return { content, fixed: purged0.stripped }
  }
}
