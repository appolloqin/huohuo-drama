/**
 * 本章大纲（episode.description）→ 总大纲（drama.metadata.outline）同步。
 * 本章更新为权威源，避免双源漂移（如集描述有税银句而总纲没有）。
 */
import * as dramasRepo from '../../db/repos/dramas/index.js'
import { now } from '../../common/http/response.js'
import { mergeNovelMetadata, parseNovelMetadata } from '../../common/novel/novel-meta.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  normalizeChapterSectionForBook,
  replaceOutlineChapterSection,
  sliceOutlineChapterSection,
} from './novel-outline-drama-fields.js'

function normalizeForCompare(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim()
}

/**
 * 将本章大纲写回总大纲第 N 章块。
 * @returns 是否改写了总大纲
 */
export async function syncChapterOutlineToBookOutline(args: {
  dramaId: number
  chapterNumber: number
  chapterOutline: string
  fallbackTitle?: string
}): Promise<{ synced: boolean; reason?: string }> {
  const { dramaId, chapterNumber } = args
  const chapterOutline = (args.chapterOutline || '').trim()
  if (!(dramaId > 0) || !(chapterNumber >= 1)) {
    return { synced: false, reason: 'bad_args' }
  }
  if (!chapterOutline) {
    // 清空本章自定义时不删总纲分章（避免误抹）
    return { synced: false, reason: 'empty_chapter_outline' }
  }

  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama) return { synced: false, reason: 'drama_missing' }
  const meta = parseNovelMetadata(drama.metadata)
  const bookOutline = (meta.outline || '').trim()
  if (!bookOutline) return { synced: false, reason: 'no_book_outline' }

  const section = normalizeChapterSectionForBook({
    chapterNumber,
    chapterOutline,
    fallbackTitle: args.fallbackTitle,
  })
  if (!section) return { synced: false, reason: 'normalize_empty' }

  const prev = sliceOutlineChapterSection(bookOutline, chapterNumber)
  if (normalizeForCompare(prev) === normalizeForCompare(section)) {
    return { synced: false, reason: 'unchanged' }
  }

  const nextOutline = replaceOutlineChapterSection(bookOutline, chapterNumber, section)
  if (normalizeForCompare(nextOutline) === normalizeForCompare(bookOutline)) {
    return { synced: false, reason: 'replace_noop' }
  }

  await dramasRepo.updateDrama(dramaId, {
    metadata: mergeNovelMetadata(drama.metadata, { outline: nextOutline }),
    updatedAt: now(),
  })
  logTaskWarn('Novel', 'chapter-outline-synced-to-book', {
    dramaId,
    chapterNumber,
    fromChars: [...prev].length,
    toChars: [...section].length,
  })
  return { synced: true }
}
