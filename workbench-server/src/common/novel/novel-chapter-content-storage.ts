import fs from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '../media/local-media-store.js'
import { resolveDataRoot, resolveLegacyDataRoot } from '../media/data-root.js'
import { readTextBlob, writeTextBlob } from '../storage/text-blob-storage.js'
import { splitProseAndChangeRecord } from './novel-change-record.js'

const CH_FILE = (chapterNumber: number) => `ch_${String(chapterNumber).padStart(3, '0')}.md`
const VOL_DIR = (vol: number) => `vol_${String(vol).padStart(2, '0')}`

/** 旧路径（兼容读取）：storage/novels/{dramaId}/episodes/{episodeId}/content.md */
export function legacyStorageNovelsRelativePath(dramaId: number, episodeId: number): string {
  return `storage/novels/${dramaId}/episodes/${episodeId}/content.md`
}

/** 小说正文路径：novel-memory/{dramaId}/chapters/vol_XX/ch_YYY.md */
export function novelChapterContentRelativePath(
  dramaId: number,
  chapterNumber: number,
  vol = 1,
): string {
  return `novel-memory/${dramaId}/chapters/${VOL_DIR(vol)}/${CH_FILE(chapterNumber)}`
}

function dataRoots(): string[] {
  const primary = DATA_ROOT || resolveDataRoot()
  const legacy = resolveLegacyDataRoot()
  return legacy === primary ? [primary] : [primary, legacy]
}

/** 在各卷目录中查找已有章节文件（相对 DATA_ROOT） */
export function findNovelMemoryChapterRelativePath(
  dramaId: number,
  chapterNumber: number,
): string | null {
  const name = CH_FILE(chapterNumber)
  for (const root of dataRoots()) {
    const chaptersRoot = path.join(root, 'novel-memory', String(dramaId), 'chapters')
    if (!fs.existsSync(chaptersRoot)) continue
    let vols: string[]
    try {
      vols = fs.readdirSync(chaptersRoot).filter((d) => d.startsWith('vol_'))
    } catch {
      continue
    }
    for (const vol of vols.sort()) {
      if (fs.existsSync(path.join(chaptersRoot, vol, name))) {
        return `novel-memory/${dramaId}/chapters/${vol}/${name}`
      }
    }
  }
  return null
}

export function readNovelMemoryChapter(dramaId: number, chapterNumber: number): string | null {
  const rel = findNovelMemoryChapterRelativePath(dramaId, chapterNumber)
  if (!rel) return null
  return readTextBlob(rel)
}

export type PersistNovelChapterArgs = {
  dramaId: number
  episodeId: number
  chapterNumber: number
  vol?: number
  value: string | null | undefined
}

/**
 * 小说正文落盘到 novel-memory/…/chapters；DB content 置空，路径写入 content_blob_path。
 * 若正文尾附有【变更记录】，只写读者正文（变更记录应由 metadata.causal_change_record 承载）。
 */
export function persistNovelChapterContentToDisk(
  args: PersistNovelChapterArgs,
): { inline: null; blobPath: string | null; changeBlock: string | null } {
  const { dramaId, chapterNumber, value } = args
  if (value == null || String(value).trim() === '') {
    return { inline: null, blobPath: null, changeBlock: null }
  }

  const { prose, changeBlock } = splitProseAndChangeRecord(String(value))
  if (!prose.trim()) {
    return { inline: null, blobPath: null, changeBlock }
  }

  const existing = findNovelMemoryChapterRelativePath(dramaId, chapterNumber)
  const blobPath =
    existing
    ?? novelChapterContentRelativePath(dramaId, chapterNumber, args.vol && args.vol > 0 ? args.vol : 1)

  writeTextBlob(blobPath, prose)
  return { inline: null, blobPath, changeBlock }
}

export function readNovelChapterContentFromDisk(blobPath: string | null | undefined): string | null {
  if (!blobPath?.trim()) return null
  return readTextBlob(blobPath)
}

/** 解析章节正文：blob → novel-memory → 旧 storage/novels → DB inline（含可能粘连的变更记录） */
export function resolveNovelEpisodeContent(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  inline: string | null | undefined
  blobPath: string | null | undefined
}): string | null {
  const { dramaId, episodeId, chapterNumber, inline, blobPath } = args

  if (blobPath) {
    const fromBlob = readTextBlob(blobPath)
    if (fromBlob != null && fromBlob.trim() !== '') return fromBlob
  }

  const fromMemory = readNovelMemoryChapter(dramaId, chapterNumber)
  if (fromMemory != null && fromMemory.trim() !== '') return fromMemory

  const legacy = readTextBlob(legacyStorageNovelsRelativePath(dramaId, episodeId))
  if (legacy != null && legacy.trim() !== '') return legacy

  if (inline != null && String(inline).trim() !== '') return inline

  if (blobPath) {
    const fromBlob = readTextBlob(blobPath)
    if (fromBlob != null) return fromBlob
  }
  return inline ?? null
}

/** 读者可见正文（剥掉【变更记录】） */
export function resolveNovelEpisodeProse(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  inline: string | null | undefined
  blobPath: string | null | undefined
}): string | null {
  const full = resolveNovelEpisodeContent(args)
  if (full == null) return null
  const { prose } = splitProseAndChangeRecord(full)
  return prose || null
}
