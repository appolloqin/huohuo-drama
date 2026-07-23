import type { EpisodeRow } from '../../db/repos/types.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { splitProseAndChangeRecord } from '../../common/novel/novel-change-record.js'
import { mergeEpisodeMetadata } from '../../common/drama/episode-meta.js'
import {
  resolveChapterProse,
  writeChapter,
} from './novel-chapter-store.js'

export type SaveChapterContentArgs = {
  dramaId: number
  episodeId: number
  chapterNumber: number
  content: string | null | undefined
  vol?: number
  existingMetadata?: string | null
}

export type SaveChapterContentResult = {
  content: null
  contentBlobPath: string | null
  metadata: string
  proseCharCount: number
}

/** 从磁盘解析读者正文（不含【变更记录】）填入 episode.content */
export function hydrateNovelEpisode<T extends EpisodeRow>(row: T): T {
  const dramaId = Number(row.dramaId)
  const episodeId = Number(row.id)
  const chapterNumber = Number(row.episodeNumber)
  if (!Number.isFinite(dramaId) || !Number.isFinite(chapterNumber) || chapterNumber <= 0) {
    return row
  }
  return {
    ...row,
    content: resolveChapterProse({
      dramaId,
      episodeId,
      chapterNumber,
      inline: row.content,
      blobPath: row.contentBlobPath,
    }),
  }
}

/**
 * 保存小说正文到 novel-memory/chapters（只写读者正文）；
 * 【变更记录】若粘在正文末尾则拆入 metadata.causal_change_record。
 */
export function saveChapterContent(args: SaveChapterContentArgs): SaveChapterContentResult {
  const { dramaId, episodeId, chapterNumber, content, vol, existingMetadata } = args
  const raw = typeof content === 'string' ? content : ''
  const { prose, changeBlock } = splitProseAndChangeRecord(raw)
  const p = writeChapter({
    dramaId,
    episodeId,
    chapterNumber,
    vol,
    value: prose || null,
  })
  const proseCharCount = countNovelChars(prose)
  const metaPatch: Record<string, unknown> = { prose_char_count: proseCharCount }
  if (changeBlock) metaPatch.causal_change_record = changeBlock
  const metadata = mergeEpisodeMetadata(existingMetadata, metaPatch)
  return {
    content: null,
    contentBlobPath: p.blobPath,
    metadata,
    proseCharCount,
  }
}

export function getChapterContent(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  inline?: string | null
  blobPath?: string | null
}): string | null {
  return resolveChapterProse({
    dramaId: args.dramaId,
    episodeId: args.episodeId,
    chapterNumber: args.chapterNumber,
    inline: args.inline,
    blobPath: args.blobPath,
  })
}
