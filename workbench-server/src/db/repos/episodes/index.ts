import { isMysqlDriver } from '../../driver.js'
import type { CharacterRow, DbRunResult, EpisodeRow, SceneRow, StoryboardRow, VideoMergeRow } from '../types.js'
import { isNovelProject } from '../../../common/novel/novel-meta.js'
import { countNovelChars } from '../../../common/novel/novel-char-limit.js'
import { mergeEpisodeMetadata } from '../../../common/drama/episode-meta.js'
import { applyEpisodeTextPatch, hydrateEpisodeRow } from '../../../common/storage/text-blob-repo.js'
import * as dramasRepo from '../dramas/index.js'
import type { EpisodeListFilter, EpisodeStatsRow, NewEpisodeInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

async function resolveNovelContentDiskOnly(
  episodeId: number,
  dramaIdHint?: number,
): Promise<{ novelContentDiskOnly: boolean; dramaId: number } | null> {
  const row = isMysqlDriver()
    ? await mysql.findEpisodeById(episodeId)
    : sqlite.findEpisodeById(episodeId)
  if (!row) return null
  const dramaId = dramaIdHint ?? row.dramaId
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || !isNovelProject(drama)) return null
  return { novelContentDiskOnly: true, dramaId }
}

function attachProseCharCountMetadata(
  patch: Record<string, unknown>,
  existingMetadata: string | null | undefined,
): Record<string, unknown> {
  if (!('content' in patch)) return patch
  const proseCharCount = countNovelChars(typeof patch.content === 'string' ? patch.content : '')
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
    const novelOpts = await resolveNovelContentDiskOnly(id, rest.dramaId)
    let patch = applyEpisodeTextPatch(
      id,
      { content, scriptContent, formattedScript },
      novelOpts ?? undefined,
    )
    if (content != null) {
      patch = attachProseCharCountMetadata(
        { ...patch, content },
        rest.metadata as string | null | undefined,
      )
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
  const novelOpts = 'content' in patch ? await resolveNovelContentDiskOnly(id) : null
  let next = applyEpisodeTextPatch(id, patch, novelOpts ?? undefined)
  if ('content' in patch) {
    const row = await findEpisodeRowRaw(id)
    next = attachProseCharCountMetadata(
      { ...next, content: patch.content },
      'metadata' in patch ? patch.metadata as string | null | undefined : row?.metadata,
    )
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
