#!/usr/bin/env node
/**
 * 小说章节正文存储冒烟：novel-memory 读写 + hydrate/save 路径约定。
 *
 * 用法：cd workbench-server && npm run smoke:novel-chapter
 *
 * 使用临时 DATA_PATH，不依赖已有 DB / 运行中的 API。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'huohuo-novel-chapter-smoke-'))
process.env.DATA_PATH = tmpRoot

const dramaId = 900001
const episodeId = 900002
const chapterNumber = 7
const marker = `smoke-novel-chapter-${Date.now()}`

function fail(msg, detail) {
  console.error(`FAIL ${msg}`, detail ?? '')
  process.exit(1)
}

function ok(msg) {
  console.log(`OK   ${msg}`)
}

console.log(`[smoke:novel-chapter] DATA_PATH=${tmpRoot}`)

// DATA_PATH 必须在 import store 之前设置（DATA_ROOT 模块加载时固化）
const storeUrl = pathToFileURL(
  path.resolve(scriptDir, '../src/services/novel/novel-chapter-store.ts'),
).href
const serviceUrl = pathToFileURL(
  path.resolve(scriptDir, '../src/services/novel/novel-chapter-service.ts'),
).href

const {
  findChapterPath,
  writeChapter,
  resolveChapterContent,
  chapterRelativePath,
} = await import(storeUrl)
const { saveChapterContent, hydrateNovelEpisode, getChapterContent } = await import(serviceUrl)

// 1) 直接写盘到 novel-memory
const written = writeChapter({
  dramaId,
  episodeId,
  chapterNumber,
  value: `# Ch ${chapterNumber}\n\n${marker}\n`,
})
if (!written.blobPath?.startsWith('novel-memory/')) {
  fail('writeChapter path must be under novel-memory/', written)
}
if (written.blobPath.includes('storage/novels')) {
  fail('writeChapter must not use storage/novels', written)
}
ok(`writeChapter → ${written.blobPath}`)

const abs = path.join(tmpRoot, written.blobPath)
if (!fs.existsSync(abs)) fail('chapter file missing on disk', abs)
const diskText = fs.readFileSync(abs, 'utf8')
if (!diskText.includes(marker)) fail('disk content missing marker', diskText.slice(0, 200))
ok('disk file readable')

// 2) hydrate 等价路径：content 非空
const hydrated = hydrateNovelEpisode({
  id: episodeId,
  dramaId,
  episodeNumber: chapterNumber,
  content: null,
  contentBlobPath: written.blobPath,
  metadata: null,
})
if (!hydrated.content?.includes(marker)) {
  fail('hydrateNovelEpisode content empty', hydrated.content)
}
ok('hydrateNovelEpisode fills content')

const viaGet = getChapterContent({
  dramaId,
  episodeId,
  chapterNumber,
  inline: null,
  blobPath: null,
})
if (!viaGet?.includes(marker)) fail('getChapterContent via novel-memory scan', viaGet)
ok('getChapterContent finds novel-memory without blob_path')

// 3) saveChapterContent 更新后仍在 novel-memory，内容一致
const updatedMarker = `${marker}-updated`
const saved = saveChapterContent({
  dramaId,
  episodeId,
  chapterNumber,
  content: `Updated body\n${updatedMarker}\n`,
  existingMetadata: null,
})
if (saved.content !== null) fail('saveChapterContent must return content: null', saved)
if (!saved.contentBlobPath?.startsWith('novel-memory/')) {
  fail('save path must be novel-memory/', saved)
}
if (saved.contentBlobPath.includes('storage/novels')) {
  fail('save must not use storage/novels', saved)
}
ok(`saveChapterContent → ${saved.contentBlobPath}`)

const after = fs.readFileSync(path.join(tmpRoot, saved.contentBlobPath), 'utf8')
if (!after.includes(updatedMarker)) fail('saved file content mismatch', after.slice(0, 200))
ok('saved file content matches')

const found = findChapterPath(dramaId, chapterNumber)
if (found !== saved.contentBlobPath) {
  fail('findChapterPath mismatch', { found, expected: saved.contentBlobPath })
}
ok('findChapterPath matches save')

const expectedRel = chapterRelativePath(dramaId, chapterNumber, 1)
const resolved = resolveChapterContent({
  dramaId,
  episodeId,
  chapterNumber,
  inline: null,
  blobPath: expectedRel,
})
if (!resolved?.includes(updatedMarker)) fail('resolveChapterContent', resolved)
ok('resolveChapterContent')

// 4) 粘连【变更记录】时：落盘只保留正文，字数不含变更记录
const withRecord = `正文段落\n${updatedMarker}\n\n【变更记录】\n- 场景: 测试\n  因果: 冒烟校验用\n`
const saved2 = saveChapterContent({
  dramaId,
  episodeId,
  chapterNumber,
  content: withRecord,
  existingMetadata: null,
})
const after2 = fs.readFileSync(path.join(tmpRoot, saved2.contentBlobPath), 'utf8')
if (after2.includes('【变更记录】')) fail('disk must not keep change record', after2.slice(-80))
if (!after2.includes(updatedMarker)) fail('prose lost after detach', after2)
if (saved2.proseCharCount !== [...after2].length) {
  fail('proseCharCount must match disk prose', { count: saved2.proseCharCount, disk: [...after2].length })
}
ok('change record detached; prose_char_count matches editor')

// 清理临时目录（忽略失败）
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
} catch {
  // ignore
}

console.log('[smoke:novel-chapter] all checks passed')
