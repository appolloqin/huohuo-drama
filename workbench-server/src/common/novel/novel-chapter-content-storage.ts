import { readTextBlob, writeTextBlob } from '../storage/text-blob-storage.js'

/** 小说章节正文磁盘路径（相对 DATA_ROOT） */
export function novelChapterContentRelativePath(dramaId: number, episodeId: number): string {
  return `storage/novels/${dramaId}/episodes/${episodeId}/content.md`
}

/** 小说正文只落盘；DB `content` 列为 null，路径写入 `content_blob_path` */
export function persistNovelChapterContentToDisk(
  dramaId: number,
  episodeId: number,
  value: string | null | undefined,
): { inline: null; blobPath: string | null } {
  if (value == null || value.trim() === '') {
    return { inline: null, blobPath: null }
  }
  const blobPath = novelChapterContentRelativePath(dramaId, episodeId)
  writeTextBlob(blobPath, value)
  return { inline: null, blobPath }
}

export function readNovelChapterContentFromDisk(blobPath: string | null | undefined): string | null {
  if (!blobPath?.trim()) return null
  return readTextBlob(blobPath)
}
