import { isMysqlDriver } from '../../driver.js'
import type { CharacterRow, DbRunResult, EpisodeRow, SceneRow, StoryboardRow, VideoMergeRow } from '../types.js'
import { isNovelProject } from '../../../common/novel/novel-meta.js'
import { countNovelChars } from '../../../common/novel/novel-char-limit.js'
import { splitProseAndChangeRecord } from '../../../common/novel/novel-change-record.js'
import { mergeEpisodeMetadata } from '../../../common/drama/episode-meta.js'
import { persistNovelChapterContentToDisk } from '../../../common/novel/novel-chapter-content-storage.js'
import { applyEpisodeTextPatch, hydrateEpisodeRow } from '../../../common/storage/text-blob-repo.js'
import * as dramasRepo from '../dramas/index.js'
import type { EpisodeListFilter, EpisodeStatsRow, NewEpisodeInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

async function resolveNovelChapterContext(
  episodeId: number,
  dramaIdHint?: number,
): Promise<{ dramaId: number; chapterNumber: number; existingMetadata: string | null } | null> {
  const row = isMysqlDriver()
    ? await mysql.findEpisodeById(episodeId)
    : sqlite.findEpisodeById(episodeId)
  if (!row) return null
  const dramaId = dramaIdHint ?? row.dramaId
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || !isNovelProject(drama)) return null
  const chapterNumber = Number(row.episodeNumber) || 0
  if (chapterNumber <= 0) return null
  return {
    dramaId,
    chapterNumber,
    existingMetadata: row.metadata ?? null,
  }
}

function saveNovelContentPatch(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  content: string | null
  existingMetadata: string | null | undefined
}): { content: null; contentBlobPath: string | null; metadata: string } {
  const raw = args.content ?? ''
  const { prose, changeBlock } = splitProseAndChangeRecord(raw)
  const p = persistNovelChapterContentToDisk({
    dramaId: args.dramaId,
    episodeId: args.episodeId,
    chapterNumber: args.chapterNumber,
    value: prose || null,
  })
  const proseCharCount = countNovelChars(prose)
  const metaPatch: Record<string, unknown> = { prose_char_count: proseCharCount }
  if (changeBlock) metaPatch.causal_change_record = changeBlock
  return {
    content: null,
    contentBlobPath: p.blobPath,
    metadata: mergeEpisodeMetadata(args.existingMetadata, metaPatch),
  }
}

function attachProseCharCountMetadata(
  patch: Record<string, unknown>,
  existingMetadata: string | null | undefined,
  contentForCount?: string | null,
): Record<string, unknown> {
  const raw = contentForCount !== undefined
    ? contentForCount
    : ('content' in patch ? patch.content : undefined)
  if (contentForCount === undefined && !('content' in patch)) return patch
  const proseCharCount = countNovelChars(typeof raw === 'string' ? raw : '')
  const baseMeta = 'metadata' in patch ? patch.metadata : existingMetadata
  return {
    ...patch,
    metadata: mergeEpisodeMetadata(baseMeta as string | null | undefined, { prose_char_count: proseCharCount }),
  }
}

async function findEpisodeRowRaw(id: number) {
  return isMysqlDriver() ? mysql.findEpisodeById(id) : sqlite.findEpisodeById(id)
}

export type { EpisodeListFilter, EpisodeListItemRow, EpisodeStatsRow, NewEpisodeInput } from './sqlite.js'

export async function listSiblingEpisodesOrdered(dramaId: number): Promise<EpisodeRow[]> {
  const rows = isMysqlDriver()
    ? await mysql.listSiblingEpisodesOrdered(dramaId)
    : sqlite.listSiblingEpisodesOrdered(dramaId)
  return rows.map(hydrateEpisodeRow)
}

export async function insertEpisode(input: NewEpisodeInput): Promise<DbRunResult> {
  const { content, scriptContent, formattedScript, ...rest } = input
  const result = isMysqlDriver()
    ? await mysql.insertEpisode({ ...rest, content: null, scriptContent: null, formattedScript: null })
    : sqlite.insertEpisode({ ...rest, content: null, scriptContent: null, formattedScript: null })
  const id = Number(result.lastInsertRowid)
  if (id > 0 && (content != null || scriptContent != null || formattedScript != null)) {
    const novelCtx = content != null ? await resolveNovelChapterContext(id, rest.dramaId) : null
    let patch: Record<string, unknown>
    if (novelCtx && content != null) {
      const saved = saveNovelContentPatch({
        dramaId: novelCtx.dramaId,
        episodeId: id,
        chapterNumber: novelCtx.chapterNumber,
        content: typeof content === 'string' ? content : null,
        existingMetadata: (rest.metadata as string | null | undefined) ?? novelCtx.existingMetadata,
      })
      patch = applyEpisodeTextPatch(id, { scriptContent, formattedScript })
      patch.content = saved.content
      patch.contentBlobPath = saved.contentBlobPath
      patch.metadata = saved.metadata
    } else {
      patch = applyEpisodeTextPatch(id, { content, scriptContent, formattedScript })
      if (content != null) {
        patch = attachProseCharCountMetadata(
          patch,
          rest.metadata as string | null | undefined,
          typeof content === 'string' ? content : null,
        )
      }
    }
    if (isMysqlDriver()) await mysql.updateEpisode(id, patch)
    else sqlite.updateEpisode(id, patch)
  }
  return result
}

export async function findEpisodeById(id: number): Promise<EpisodeRow | null> {
  const row = isMysqlDriver() ? await mysql.findEpisodeById(id) : sqlite.findEpisodeById(id)
  return row ? hydrateEpisodeRow(row) : null
}

export async function updateEpisode(id: number, patch: Record<string, unknown>): Promise<void> {
  const novelCtx = 'content' in patch ? await resolveNovelChapterContext(id) : null
  let next: Record<string, unknown>

  if (novelCtx && 'content' in patch) {
    // 上层已经 novel-chapter-service 落盘：只同步 DB 列，勿再用 null content 覆盖磁盘
    const alreadyOnDisk = 'contentBlobPath' in patch && patch.content === null
    if (alreadyOnDisk) {
      const { content: _drop, ...restPatch } = patch
      next = applyEpisodeTextPatch(id, restPatch)
      next.content = null
      next.contentBlobPath = patch.contentBlobPath
      if ('metadata' in patch) next.metadata = patch.metadata
    } else {
      const row = await findEpisodeRowRaw(id)
      const saved = saveNovelContentPatch({
        dramaId: novelCtx.dramaId,
        episodeId: id,
        chapterNumber: novelCtx.chapterNumber,
        content: typeof patch.content === 'string' ? patch.content : null,
        existingMetadata:
          'metadata' in patch
            ? (patch.metadata as string | null | undefined)
            : (row?.metadata ?? novelCtx.existingMetadata),
      })
      const { content: _drop, ...restPatch } = patch
      next = applyEpisodeTextPatch(id, restPatch)
      next.content = saved.content
      next.contentBlobPath = saved.contentBlobPath
      next.metadata = saved.metadata
    }
  } else {
    next = applyEpisodeTextPatch(id, patch)
    if ('content' in patch) {
      const row = await findEpisodeRowRaw(id)
      next = attachProseCharCountMetadata(
        next,
        'metadata' in patch ? patch.metadata as string | null | undefined : row?.metadata,
        typeof patch.content === 'string' ? patch.content : null,
      )
    }
  }

  if (isMysqlDriver()) return mysql.updateEpisode(id, next)
  sqlite.updateEpisode(id, next)
}

export async function countEpisodesFiltered(
  dramaId: number,
  isNovel: boolean,
  filter: EpisodeListFilter,
): Promise<number> {
  return isMysqlDriver()
    ? mysql.countEpisodesFiltered(dramaId, isNovel, filter)
    : sqlite.countEpisodesFiltered(dramaId, isNovel, filter)
}

export async function listEpisodesFiltered(args: {
  dramaId: number
  isNovel: boolean
  filter: EpisodeListFilter
  page: number
  pageSize: number
}): Promise<import('./sqlite.js').EpisodeListItemRow[]> {
  return isMysqlDriver()
    ? mysql.listEpisodesFiltered(args)
    : sqlite.listEpisodesFiltered(args)
}

export async function findEpisodeByDramaAndNumber(
  dramaId: number,
  episodeNumber: number,
): Promise<EpisodeRow | null> {
  const row = isMysqlDriver()
    ? await mysql.findEpisodeByDramaAndNumber(dramaId, episodeNumber)
    : sqlite.findEpisodeByDramaAndNumber(dramaId, episodeNumber)
  return row ? hydrateEpisodeRow(row) : null
}

export async function aggregateEpisodeListStats(dramaId: number, isNovel: boolean) {
  return isMysqlDriver()
    ? mysql.aggregateEpisodeListStats(dramaId, isNovel)
    : sqlite.aggregateEpisodeListStats(dramaId, isNovel)
}

export async function listEpisodeStatsRows(dramaId: number): Promise<EpisodeStatsRow[]> {
  const rows = isMysqlDriver() ? await mysql.listEpisodeStatsRows(dramaId) : sqlite.listEpisodeStatsRows(dramaId)
  return rows.map((row) => {
    const hydrated = hydrateEpisodeRow(row as EpisodeRow)
    return {
      content: hydrated.content,
      scriptContent: hydrated.scriptContent,
      formattedScript: hydrated.formattedScript,
      videoUrl: row.videoUrl,
      metadata: row.metadata,
    }
  })
}

export async function listEpisodeSceneLinks(episodeId: number) {
  return isMysqlDriver() ? mysql.listEpisodeSceneLinks(episodeId) : sqlite.listEpisodeSceneLinks(episodeId)
}

export async function listScenesByIds(sceneIds: number[]): Promise<SceneRow[]> {
  return isMysqlDriver() ? mysql.listScenesByIds(sceneIds) : sqlite.listScenesByIds(sceneIds)
}

export async function listEpisodeCharacterLinks(episodeId: number) {
  return isMysqlDriver()
    ? mysql.listEpisodeCharacterLinks(episodeId)
    : sqlite.listEpisodeCharacterLinks(episodeId)
}

export async function listStoryboardIdsByEpisode(episodeId: number): Promise<number[]> {
  return isMysqlDriver()
    ? mysql.listStoryboardIdsByEpisode(episodeId)
    : sqlite.listStoryboardIdsByEpisode(episodeId)
}

export async function listAllStoryboardCharacterLinks() {
  return isMysqlDriver() ? mysql.listAllStoryboardCharacterLinks() : sqlite.listAllStoryboardCharacterLinks()
}

export async function listStoryboardsByEpisodeOrdered(episodeId: number): Promise<StoryboardRow[]> {
  return isMysqlDriver()
    ? mysql.listStoryboardsByEpisodeOrdered(episodeId)
    : sqlite.listStoryboardsByEpisodeOrdered(episodeId)
}

export async function listCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return isMysqlDriver() ? mysql.listCharactersByDrama(dramaId) : sqlite.listCharactersByDrama(dramaId)
}

export async function listAllCharacters(): Promise<CharacterRow[]> {
  return isMysqlDriver() ? mysql.listAllCharacters() : sqlite.listAllCharacters()
}

export async function listScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  return isMysqlDriver() ? mysql.listScenesByDrama(dramaId) : sqlite.listScenesByDrama(dramaId)
}

export async function listStoryboardsByEpisode(episodeId: number): Promise<StoryboardRow[]> {
  return isMysqlDriver() ? mysql.listStoryboardsByEpisode(episodeId) : sqlite.listStoryboardsByEpisode(episodeId)
}

export async function listVideoMergesByEpisode(episodeId: number): Promise<VideoMergeRow[]> {
  return isMysqlDriver() ? mysql.listVideoMergesByEpisode(episodeId) : sqlite.listVideoMergesByEpisode(episodeId)
}

export async function episodeCharacterLinkExists(episodeId: number, characterId: number): Promise<boolean> {
  return isMysqlDriver()
    ? mysql.episodeCharacterLinkExists(episodeId, characterId)
    : sqlite.episodeCharacterLinkExists(episodeId, characterId)
}

export async function insertEpisodeCharacterLink(episodeId: number, characterId: number, createdAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.insertEpisodeCharacterLink(episodeId, characterId, createdAt)
  sqlite.insertEpisodeCharacterLink(episodeId, characterId, createdAt)
}

export async function episodeSceneLinkExists(episodeId: number, sceneId: number): Promise<boolean> {
  return isMysqlDriver()
    ? mysql.episodeSceneLinkExists(episodeId, sceneId)
    : sqlite.episodeSceneLinkExists(episodeId, sceneId)
}

export async function insertEpisodeSceneLink(episodeId: number, sceneId: number, createdAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.insertEpisodeSceneLink(episodeId, sceneId, createdAt)
  sqlite.insertEpisodeSceneLink(episodeId, sceneId, createdAt)
}

export async function listEpisodePropLinks(episodeId: number) {
  return isMysqlDriver()
    ? mysql.listEpisodePropLinks(episodeId)
    : sqlite.listEpisodePropLinks(episodeId)
}

export async function insertEpisodePropLink(episodeId: number, propId: number, createdAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.insertEpisodePropLink(episodeId, propId, createdAt)
  sqlite.insertEpisodePropLink(episodeId, propId, createdAt)
}

export async function episodePropLinkExists(episodeId: number, propId: number): Promise<boolean> {
  return isMysqlDriver()
    ? mysql.episodePropLinkExists(episodeId, propId)
    : sqlite.episodePropLinkExists(episodeId, propId)
}
