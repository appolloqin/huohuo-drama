/**
 * 清空正文须删除磁盘文件，否则 hydrate 会从 novel-memory 读回旧文。
 * Run: npx tsx scripts/verify-novel-chapter-clear-content.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '../src/common/media/local-media-store.js'
import { resolveDataRoot } from '../src/common/media/data-root.js'
import {
  persistNovelChapterContentToDisk,
  resolveNovelEpisodeProse,
  novelChapterContentRelativePath,
} from '../src/common/novel/novel-chapter-content-storage.js'

const root = DATA_ROOT || resolveDataRoot()
const dramaId = 900001
const episodeId = 900001
const chapterNumber = 1
const rel = novelChapterContentRelativePath(dramaId, chapterNumber, 1)
const abs = path.join(root, rel)

fs.mkdirSync(path.dirname(abs), { recursive: true })
fs.writeFileSync(abs, '旧正文不应在清空后出现', 'utf8')

persistNovelChapterContentToDisk({
  dramaId,
  episodeId,
  chapterNumber,
  value: '',
})

if (fs.existsSync(abs)) {
  throw new Error('empty save must delete chapter file on disk')
}

const prose = resolveNovelEpisodeProse({
  dramaId,
  episodeId,
  chapterNumber,
  inline: null,
  blobPath: null,
})
if (prose && prose.trim()) {
  throw new Error(`hydrate after clear must be empty, got: ${prose.slice(0, 40)}`)
}

console.log('verify-novel-chapter-clear-content OK')
