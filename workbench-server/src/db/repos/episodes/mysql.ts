import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type {
  CharacterRow,
  DbRunResult,
  EpisodeRow,
  SceneRow,
  StoryboardRow,
  VideoMergeRow,
} from '../types.js'
import type { EpisodeListFilter, EpisodeListItemRow, EpisodeStatsRow, NewEpisodeInput } from './sqlite.js'
import { readEpisodeFrameMergedUrl, readProductionPipeline } from '../../../common/drama/episode-meta.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

function writtenSql(isNovel: boolean) {
  if (isNovel) {
    return sql`trim(coalesce(${schema.episodes.content}, '')) != ''`
  }
  return sql`trim(coalesce(${schema.episodes.videoUrl}, '')) != ''`
}

function pendingSql(isNovel: boolean) {
  if (isNovel) {
    return sql`trim(coalesce(${schema.episodes.content}, '')) = ''`
  }
  return sql`trim(coalesce(${schema.episodes.videoUrl}, '')) = ''`
}

function dramaBaseWhere(dramaId: number) {
  return and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt))
}

function filterWhere(dramaId: number, isNovel: boolean, filter: EpisodeListFilter) {
  const base = dramaBaseWhere(dramaId)
  if (filter === 'written') return and(base, writtenSql(isNovel))
  if (filter === 'pending') return and(base, pendingSql(isNovel))
  return base
}

export async function listSiblingEpisodesOrdered(dramaId: number): Promise<EpisodeRow[]> {
  return db().select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .orderBy(asc(schema.episodes.episodeNumber))
}

export async function insertEpisode(input: NewEpisodeInput): Promise<DbRunResult> {
  const result = await db().insert(schema.episodes).values(input)
  return normalizeRun(result)
}

export async function findEpisodeById(id: number): Promise<EpisodeRow | null> {
  const rows = await db().select().from(schema.episodes).where(eq(schema.episodes.id, id))
  return rows[0] ?? null
}

export async function updateEpisode(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.episodes).set(patch).where(eq(schema.episodes.id, id))
}

export async function countEpisodesFiltered(dramaId: number, isNovel: boolean, filter: EpisodeListFilter): Promise<number> {
  const where = filterWhere(dramaId, isNovel, filter)
  const rows = await db().select({ count: sql<number>`count(*)` }).from(schema.episodes).where(where)
  return Number(rows[0]?.count) || 0
}

export async function listEpisodesFiltered(args: {
  dramaId: number
  isNovel: boolean
  filter: EpisodeListFilter
  page: number
  pageSize: number
}): Promise<EpisodeListItemRow[]> {
  const where = filterWhere(args.dramaId, args.isNovel, args.filter)
  const baseColumns = {
    id: schema.episodes.id,
    dramaId: schema.episodes.dramaId,
    episodeNumber: schema.episodes.episodeNumber,
    title: schema.episodes.title,
    description: schema.episodes.description,
    duration: schema.episodes.duration,
    status: schema.episodes.status,
    metadata: schema.episodes.metadata,
    videoUrl: schema.episodes.videoUrl,
    dramaImageConfigId: schema.episodes.dramaImageConfigId,
    dramaVideoConfigId: schema.episodes.dramaVideoConfigId,
    dramaAudioConfigId: schema.episodes.dramaAudioConfigId,
  }
  if (args.isNovel) {
    return db().select({
      ...baseColumns,
      contentCharCount: sql<number>`CASE
        WHEN CHAR_LENGTH(coalesce(${schema.episodes.content}, '')) > 0 THEN CHAR_LENGTH(${schema.episodes.content})
        ELSE COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${schema.episodes.metadata}, '$.prose_char_count')) AS UNSIGNED), 0)
      END`,
      hasWrittenContent: sql<number>`CASE WHEN trim(coalesce(${schema.episodes.content}, '')) != '' OR trim(coalesce(${schema.episodes.contentBlobPath}, '')) != '' THEN 1 ELSE 0 END`,
    })
      .from(schema.episodes)
      .where(where)
      .orderBy(asc(schema.episodes.episodeNumber))
      .limit(args.pageSize)
      .offset((args.page - 1) * args.pageSize)
  }
  return db().select(baseColumns)
    .from(schema.episodes)
    .where(where)
    .orderBy(asc(schema.episodes.episodeNumber))
    .limit(args.pageSize)
    .offset((args.page - 1) * args.pageSize)
}

export async function findEpisodeByDramaAndNumber(dramaId: number, episodeNumber: number): Promise<EpisodeRow | null> {
  const rows = await db().select().from(schema.episodes)
    .where(and(
      eq(schema.episodes.dramaId, dramaId),
      eq(schema.episodes.episodeNumber, episodeNumber),
      isNull(schema.episodes.deletedAt),
    ))
  return rows[0] ?? null
}

export async function listEpisodeStatsRows(dramaId: number): Promise<EpisodeStatsRow[]> {
  return db().select({
    content: schema.episodes.content,
    scriptContent: schema.episodes.scriptContent,
    formattedScript: schema.episodes.formattedScript,
    contentBlobPath: schema.episodes.contentBlobPath,
    scriptBlobPath: schema.episodes.scriptBlobPath,
    formattedScriptBlobPath: schema.episodes.formattedScriptBlobPath,
    videoUrl: schema.episodes.videoUrl,
    metadata: schema.episodes.metadata,
  })
    .from(schema.episodes)
    .where(dramaBaseWhere(dramaId))
}

export type EpisodeListAggregateStats = {
  total: number
  written: number
  totalChars: number
}

/** SQL-only stats for list/detail headers — never hydrates blob files. */
export async function aggregateEpisodeListStats(
  dramaId: number,
  isNovel: boolean,
): Promise<EpisodeListAggregateStats> {
  if (isNovel) {
    const rows = await db().select({
      total: sql<number>`COUNT(*)`,
      written: sql<number>`SUM(CASE WHEN trim(coalesce(${schema.episodes.content}, '')) != '' OR trim(coalesce(${schema.episodes.contentBlobPath}, '')) != '' THEN 1 ELSE 0 END)`,
      totalChars: sql<number>`COALESCE(SUM(CASE
        WHEN CHAR_LENGTH(coalesce(${schema.episodes.content}, '')) > 0 THEN CHAR_LENGTH(${schema.episodes.content})
        ELSE COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${schema.episodes.metadata}, '$.prose_char_count')) AS UNSIGNED), 0)
      END), 0)`,
    })
      .from(schema.episodes)
      .where(dramaBaseWhere(dramaId))
    const row = rows[0]
    return {
      total: Number(row?.total) || 0,
      written: Number(row?.written) || 0,
      totalChars: Number(row?.totalChars) || 0,
    }
  }

  const rows = await db().select({
    videoUrl: schema.episodes.videoUrl,
    metadata: schema.episodes.metadata,
  })
    .from(schema.episodes)
    .where(dramaBaseWhere(dramaId))

  let written = 0
  for (const row of rows) {
    const pipeline = readProductionPipeline(row.metadata)
    if (pipeline === 'frame_slideshow') {
      if (readEpisodeFrameMergedUrl(row.metadata)) written += 1
    } else if ((row.videoUrl || '').trim()) {
      written += 1
    }
  }
  return { total: rows.length, written, totalChars: 0 }
}

export async function listEpisodeSceneLinks(episodeId: number) {
  return db().select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId))
}

export async function listScenesByIds(sceneIds: number[]): Promise<SceneRow[]> {
  if (!sceneIds.length) return []
  return db().select().from(schema.scenes).where(inArray(schema.scenes.id, sceneIds))
}

export async function listEpisodeCharacterLinks(episodeId: number) {
  return db().select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId))
}

export async function listStoryboardIdsByEpisode(episodeId: number): Promise<number[]> {
  const rows = await db().select({ id: schema.storyboards.id }).from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  return rows.map(r => r.id)
}

export async function listAllStoryboardCharacterLinks() {
  return db().select().from(schema.storyboardCharacters)
}

export async function listStoryboardsByEpisodeOrdered(episodeId: number): Promise<StoryboardRow[]> {
  return db().select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
}

export async function listCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return db().select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId))
}

export async function listAllCharacters(): Promise<CharacterRow[]> {
  return db().select().from(schema.characters)
}

export async function listScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  return db().select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId))
}

export async function listStoryboardsByEpisode(episodeId: number): Promise<StoryboardRow[]> {
  return db().select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
}

export async function listVideoMergesByEpisode(episodeId: number): Promise<VideoMergeRow[]> {
  return db().select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId))
}

export async function episodeCharacterLinkExists(episodeId: number, characterId: number): Promise<boolean> {
  const rows = await db().select().from(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
  return rows.length > 0
}

export async function insertEpisodeCharacterLink(episodeId: number, characterId: number, createdAt: string): Promise<void> {
  await db().insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt })
}

export async function episodeSceneLinkExists(episodeId: number, sceneId: number): Promise<boolean> {
  const rows = await db().select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
  return rows.length > 0
}

export async function insertEpisodeSceneLink(episodeId: number, sceneId: number, createdAt: string): Promise<void> {
  await db().insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt })
}

export async function listEpisodePropLinks(episodeId: number) {
  return db().select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId))
}

export async function insertEpisodePropLink(episodeId: number, propId: number, createdAt: string): Promise<void> {
  await db().insert(schema.episodeProps).values({ episodeId, propId, createdAt })
}

export async function episodePropLinkExists(episodeId: number, propId: number): Promise<boolean> {
  const rows = await db().select().from(schema.episodeProps).where(and(
    eq(schema.episodeProps.episodeId, episodeId),
    eq(schema.episodeProps.propId, propId),
  )).limit(1)
  return rows.length > 0
}
