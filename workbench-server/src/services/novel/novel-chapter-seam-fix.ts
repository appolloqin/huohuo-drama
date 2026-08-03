/**
 * 章缝回放开篇修正：替换前 ~1400 字，保留后文。
 */
import { chatCompletionText, sanitizeModelCreativeOutput, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { detectChapterSeamReplay } from './novel-chapter-seam.js'
import { loadPrevChapterContentTail } from './novel-continuity.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { mergeOrphanShortParagraphs } from '../../common/novel/novel-paragraph-format.js'

const OPENING_CHARS = 1400

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

  const cut = Math.min(OPENING_CHARS, Math.max(600, Math.floor(content.length * 0.28)))
  const head = content.slice(0, cut)
  const rest = content.slice(cut)
  if (!rest.trim()) return { content, fixed: false }

  const system = [
    await buildNovelAgentSystem('novel_chapter_writer'),
    '',
    '当前任务：只改写【开篇片段】，消除章缝回放、场景倒退或开篇时空早于上章末。',
    '硬性：从上章已发生事实之后起笔；禁止重演上章末对白/场面高潮；禁止倒退到更早情节拍点；开篇不得早于上章末已发生事实；可留一两句承接后立刻进入本章大纲前段。',
    '篇幅与开篇片段相近（约 ±20%）；只输出开篇替换正文，不要后文、不要说明。',
  ].join('\n')

  const user = [
    hit.message,
    '',
    `【上章结尾】\n${prevTail.slice(-1000)}`,
    chapterOutline?.trim()
      ? `\n【本章大纲（若与上章冲突，以上章为准，勿按过期拍点开篇）】\n${chapterOutline.trim().slice(0, 400)}`
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
      return { content, fixed: false }
    }
    const sep = rest.startsWith('\n') ? '' : '\n\n'
    const next = `${opening.trim()}${sep}${rest}`
    const still = detectChapterSeamReplay({
      content: next,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    })
    if (still) {
      logTaskWarn('Novel', 'seam-opening-fix-still-hit', { chapterNumber })
      // 仍采用修正稿：通常已减轻回放
    }
    return { content: next, fixed: true }
  } catch (err: any) {
    logTaskWarn('Novel', 'seam-opening-fix-failed', {
      chapterNumber,
      error: err?.message || 'unknown',
    })
    return { content, fixed: false }
  }
}
