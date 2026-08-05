/**
 * 章节质量钩子 — C1/C3/C4，与 continuity 解耦
 */
import type { TextBillingContext } from '../ai/ai.js'
import { mergeEpisodeMetadata } from '../../common/drama/episode-meta.js'
import {
  isChapterCraftScoreEnabled,
  isChapterCraftStrictEnabled,
  isComplianceVetoEnabled,
  resolveChapterCraftRewriteMax,
  type NovelMetadata,
} from '../../common/novel/novel-meta.js'
import { now } from '../../common/http/response.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { ContinuityRewriteAbortError } from './novel-continuity-errors.js'
import {
  buildChapterCraftContinueFixPrompt,
  buildChapterCraftFixPrompt,
  checkNovelChapterCraft,
  type ChapterCraftResult,
} from './novel-chapter-craft-check.js'
import { continueNovelChapter, generateNovelChapterFull } from './novel-writing.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { alignNovelChapterOutlineBoundary } from './novel-outline-boundary.js'
import { detectChapterSeamColdOpen, detectChapterSeamReplay } from './novel-chapter-seam.js'
import type { ChapterEndSnapshot } from '../../common/novel/novel-continuity-state.js'
import { logTaskWarn } from '../../common/task/task-logger.js'

type GenerateArgs = Parameters<typeof generateNovelChapterFull>[0]
type ContinueArgs = Parameters<typeof continueNovelChapter>[0]

function joinExistingAndSegment(existingText: string, segment: string) {
  if (!existingText) return segment
  if (!segment) return existingText
  const sep = existingText.endsWith('\n') ? '' : '\n'
  return `${existingText}${sep}${segment}`
}

async function saveChapterCraft(episodeId: number, craft: ChapterCraftResult) {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  const metadata = mergeEpisodeMetadata(ep?.metadata, {
    chapter_craft: craft as unknown as Record<string, unknown>,
  })
  await episodesRepo.updateEpisode(episodeId, { metadata, updatedAt: now() })
}

export async function runChapterCraftPipelineHook(args: {
  content: string
  generateArgs: GenerateArgs
  dramaId: number
  episodeId: number
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  chapterOutline?: string
  billing?: TextBillingContext
  shouldStop?: () => boolean
  onPhase?: (phase: 'check' | 'rewrite', detail?: Record<string, unknown>) => void
  /** 上章结尾：用于冷开篇/回放判定 */
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
  /** 大纲/章缝未清时禁止整章重生（只评分） */
  blockStructureRewrite?: boolean
}): Promise<{ content: string; craft: ChapterCraftResult | null; rewritten: boolean; rewriteAttempts: number }> {
  const {
    generateArgs, episodeId, chapterNumber, dramaTitle, meta, chapterOutline, billing, shouldStop, onPhase,
    prevChapterTail, prevSnapshot, blockStructureRewrite,
  } = args
  let content = args.content
  let rewritten = false
  let rewriteAttempts = 0

  if (!isChapterCraftScoreEnabled(meta)) {
    return { content, craft: null, rewritten, rewriteAttempts }
  }

  const seamArgs = {
    chapterNumber,
    prevChapterTail,
    chapterOutline,
    prevSnapshot,
  }

  // 与生成侧一致：Craft 审校/重生使用对齐后写作说明；existingText 用当前正文（大纲闸门后的稿）
  const outlineAlign = alignNovelChapterOutlineBoundary({
    writingBrief: generateArgs.prompt,
    chapterOutline,
    existingText: content,
    mode: 'rewrite',
    chapterNumber,
  })
  const brief = outlineAlign.alignedBrief || generateArgs.prompt || ''

  const runCraft = async (suffix = '') => {
    onPhase?.('check', { craft: true, suffix })
    if (shouldStop?.()) throw new Error('用户已请求停止批量撰写')
    const craft = await checkNovelChapterCraft({
      content,
      chapterNumber,
      dramaTitle,
      meta,
      writingBrief: brief,
      chapterOutline,
      billing: billing ? { ...billing, reason: `小说章节质量审校${suffix}` } : undefined,
    })
    await saveChapterCraft(episodeId, craft)
    return craft
  }

  let craft = await runCraft()

  if (isComplianceVetoEnabled(meta) && craft.compliance_veto) {
    throw new ContinuityRewriteAbortError({
      chapterNumber,
      rewriteAttempts,
      score: craft.score,
      conflicts: craft.compliance_reasons.length ? craft.compliance_reasons : craft.conflicts,
      summary: craft.summary,
      reason: 'compliance_veto',
    })
  }

  const seamHit = chapterNumber >= 2 && !!detectChapterSeamReplay({
    content,
    ...seamArgs,
  })
  const coldOpen = chapterNumber >= 2 && !!detectChapterSeamColdOpen({
    content,
    ...seamArgs,
  })
  const blockRegen = !!blockStructureRewrite || coldOpen || seamHit

  const rewriteMax = resolveChapterCraftRewriteMax(meta)
  if (isChapterCraftStrictEnabled(meta) && !craft.passed) {
    while (!craft.passed) {
      if (rewriteMax > 0 && rewriteAttempts >= rewriteMax) {
        // 停损：带未通过质量结果交付正文，不空白硬停（合规一票否决仍上抛）
        break
      }
      if (blockRegen) {
        logTaskWarn('Novel', 'craft-rewrite-skipped-seam', {
          chapterNumber,
          coldOpen,
          blockStructureRewrite: !!blockStructureRewrite,
          score: craft.score,
        })
        break
      }
      rewriteAttempts += 1
      onPhase?.('rewrite', {
        craft: true,
        rewriteAttempt: rewriteAttempts,
        score: craft.score,
        conflicts: craft.conflicts,
      })
      if (shouldStop?.()) throw new Error('用户已请求停止批量撰写')

      const fixedPrompt = [
        buildChapterCraftFixPrompt(brief, craft),
        outlineAlign.boundaryBlock,
      ].filter(Boolean).join('\n\n')
      // 必须用当前正文作旧稿，禁止回灌生成前的冷开篇 existingText
      const beforeCraftRewrite = content
      content = await generateNovelChapterFull(
        {
          ...generateArgs,
          prompt: fixedPrompt,
          existingText: content,
          mode: 'rewrite',
          // craft 重生沿用「是否看下章」：用户重写才看；一次生成/数字作家不看
          includeNextChapter: generateArgs.includeNextChapter ?? generateArgs.mode === 'rewrite',
        },
        billing
          ? { ...billing, reason: `小说章节质量重生成（第${rewriteAttempts}次）` }
          : undefined,
      )
      rewritten = true
      craft = await runCraft(`（第${rewriteAttempts}次修正后）`)

      if (isComplianceVetoEnabled(meta) && craft.compliance_veto) {
        throw new ContinuityRewriteAbortError({
          chapterNumber,
          rewriteAttempts,
          score: craft.score,
          conflicts: craft.compliance_reasons.length ? craft.compliance_reasons : craft.conflicts,
          summary: craft.summary,
          reason: 'compliance_veto',
        })
      }
      // 重生后若出现冷开篇/章缝回放：回退本轮前正文
      const afterSeam = detectChapterSeamReplay({ content, ...seamArgs })
      const afterCold = detectChapterSeamColdOpen({ content, ...seamArgs })
      if (afterSeam || afterCold) {
        logTaskWarn('Novel', afterSeam ? 'craft-rewrite-stopped-seam-replay' : 'craft-rewrite-stopped-cold-open', {
          chapterNumber,
          rewriteAttempts,
          rule: afterSeam?.rule || afterCold?.rule,
        })
        content = beforeCraftRewrite
        rewritten = false
        craft = await runCraft('（章缝回退）')
        break
      }
    }
  }

  return {
    content: normalizeNovelTemporalNumerals(content),
    craft,
    rewritten,
    rewriteAttempts,
  }
}

/** 续写路径：对「已有正文 + 新增段」整章评分；修正时只重写新增段 */
export async function runChapterCraftContinueHook(args: {
  existingText: string
  segment: string
  continueArgs: ContinueArgs
  episodeId: number
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  writingBrief?: string
  chapterOutline?: string
  billing?: TextBillingContext
  shouldStop?: () => boolean
  onPhase?: (phase: 'check' | 'rewrite', detail?: Record<string, unknown>) => void
}): Promise<{
  segment: string
  content: string
  craft: ChapterCraftResult | null
  rewritten: boolean
  rewriteAttempts: number
}> {
  const {
    existingText,
    continueArgs,
    episodeId,
    chapterNumber,
    dramaTitle,
    meta,
    writingBrief,
    chapterOutline,
    billing,
    shouldStop,
    onPhase,
  } = args
  let segment = args.segment
  let content = joinExistingAndSegment(existingText, segment)
  let rewritten = false
  let rewriteAttempts = 0

  if (!isChapterCraftScoreEnabled(meta)) {
    return { segment, content, craft: null, rewritten, rewriteAttempts }
  }

  const outlineAlign = alignNovelChapterOutlineBoundary({
    writingBrief: writingBrief || chapterOutline || '续写本章',
    chapterOutline,
    existingText,
    mode: 'continue',
    chapterNumber,
  })
  const brief = outlineAlign.alignedBrief
    || writingBrief?.trim()
    || chapterOutline?.trim()
    || '续写本章'

  const runCraft = async (suffix = '') => {
    onPhase?.('check', { craft: true, continue: true, suffix })
    if (shouldStop?.()) throw new Error('用户已请求停止')
    const craft = await checkNovelChapterCraft({
      content,
      chapterNumber,
      dramaTitle,
      meta,
      writingBrief: brief,
      chapterOutline,
      billing: billing ? { ...billing, reason: `小说续写质量审校${suffix}` } : undefined,
    })
    await saveChapterCraft(episodeId, craft)
    return craft
  }

  let craft = await runCraft()

  if (isComplianceVetoEnabled(meta) && craft.compliance_veto) {
    throw new ContinuityRewriteAbortError({
      chapterNumber,
      rewriteAttempts,
      score: craft.score,
      conflicts: craft.compliance_reasons.length ? craft.compliance_reasons : craft.conflicts,
      summary: craft.summary,
      reason: 'compliance_veto',
    })
  }

  const rewriteMax = resolveChapterCraftRewriteMax(meta)
  if (isChapterCraftStrictEnabled(meta) && !craft.passed) {
    while (!craft.passed) {
      if (rewriteMax > 0 && rewriteAttempts >= rewriteMax) {
        break
      }
      rewriteAttempts += 1
      onPhase?.('rewrite', {
        craft: true,
        continue: true,
        rewriteAttempt: rewriteAttempts,
        score: craft.score,
        conflicts: craft.conflicts,
      })
      if (shouldStop?.()) throw new Error('用户已请求停止')

      const craftFixInstruction = [
        buildChapterCraftContinueFixPrompt(brief, craft),
        outlineAlign.boundaryBlock,
      ].filter(Boolean).join('\n\n')
      segment = await continueNovelChapter(
        {
          ...continueArgs,
          existingText,
          craftFixInstruction,
        },
        billing
          ? { ...billing, reason: `小说续写质量重生成（第${rewriteAttempts}次）` }
          : undefined,
      )
      content = joinExistingAndSegment(existingText, segment)
      rewritten = true
      craft = await runCraft(`（第${rewriteAttempts}次修正后）`)

      if (isComplianceVetoEnabled(meta) && craft.compliance_veto) {
        throw new ContinuityRewriteAbortError({
          chapterNumber,
          rewriteAttempts,
          score: craft.score,
          conflicts: craft.compliance_reasons.length ? craft.compliance_reasons : craft.conflicts,
          summary: craft.summary,
          reason: 'compliance_veto',
        })
      }
    }
  }

  return {
    segment: normalizeNovelTemporalNumerals(segment),
    content: normalizeNovelTemporalNumerals(content),
    craft,
    rewritten,
    rewriteAttempts,
  }
}
