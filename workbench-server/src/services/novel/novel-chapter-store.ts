/**
 * NovelChapterStore — 小说章节正文唯一磁盘入口。
 * 路径：novel-memory/{dramaId}/chapters/vol_XX/ch_YYY.md
 * 短剧媒体/text-blob 不得写入此目录；本 store 不得写入 storage/novels。
 */
export {
  findNovelMemoryChapterRelativePath as findChapterPath,
  readNovelMemoryChapter as readChapter,
  persistNovelChapterContentToDisk as writeChapter,
  readNovelChapterContentFromDisk as readChapterByBlobPath,
  resolveNovelEpisodeContent as resolveChapterContent,
  resolveNovelEpisodeProse as resolveChapterProse,
  novelChapterContentRelativePath as chapterRelativePath,
  legacyStorageNovelsRelativePath,
  type PersistNovelChapterArgs,
} from '../../common/novel/novel-chapter-content-storage.js'
