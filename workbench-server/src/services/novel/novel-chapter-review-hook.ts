/**
 * 章节平台审稿挂接：建议级落库，不阻断正文交付
 */
import { now } from '../../common/http/response.js'
import {
  isChapterReviewAutoEnabled,
  type NovelMetadata,
} from '../../common/novel/novel-meta.js'
import {
  normalizeNovelReviewPlatform,
  type NovelReviewPlatform,
} from '../../common/novel/novel-review-platforms.js'
import { mergeEpisodeMetadata } from '../../common/drama/episode-meta.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import type { TextBillingContext } from '../ai/ai.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  reviewNovelChapter,
  type ChapterReviewResult,
} from './novel-chapter-review.js'

export async function runChapterReviewPipelineHook(args: {
  content: string
  episodeId: number
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  writingBrief?: string
  chapterOutline?: string
  platform?: string | null
  billing?: TextBillingContext
  /** 强制执行（忽略 chapter_review_auto=false） */
  force?: boolean
}): Promise<ChapterReviewResult | null> {
  if (!args.force && !isChapterReviewAutoEnabled(args.meta)) return null
  const prose = (args.content || '').trim()
  if (!prose) return null

  const platform = normalizeNovelReviewPlatform(
    args.platform || args.meta.review_platform || 'fanqie',
  ) as NovelReviewPlatform

  try {
    const result = await reviewNovelChapter({
      content: prose,
      chapterNumber: args.chapterNumber,
      dramaTitle: args.dramaTitle,
      meta: args.meta,
      writingBrief: args.writingBrief,
      chapterOutline: args.chapterOutline,
      platform,
      billing: args.billing
        ? { ...args.billing, reason: args.billing.reason || '小说章节平台审稿' }
        : undefined,
    })
    const ep = await episodesRepo.findEpisodeById(args.episodeId)
    const metadata = mergeEpisodeMetadata(ep?.metadata, {
      chapter_review: result as unknown as Record<string, unknown>,
    })
    await episodesRepo.updateEpisode(args.episodeId, { metadata, updatedAt: now() })
    return result
  } catch (err: unknown) {
    logTaskWarn('Novel', 'chapter-review-hook-failed', {
      chapterNumber: args.chapterNumber,
      error: err instanceof Error ? err.message : 'review failed',
    })
    return null
  }
}
