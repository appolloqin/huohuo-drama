import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { readEpisodeFrameMergedUrl, readProductionPipeline } from '../../../common/drama/episode-meta.js'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type {
  CharacterRow,
  DbRunResult,
  EpisodeRow,
  SceneRow,
  StoryboardRow,
  VideoMergeRow,
} from '../types.js'

const db = () => getSqliteDb()

export type EpisodeListFilter = 'all' | 'written' | 'pending'

/** List/card fields only — never includes content / script bodies. */
export type EpisodeListItemRow = {
  id: number
  dramaId: number
  episodeNumber: number
  title: string | null
  description: string | null
  duration: number | null
  status: string | null
  metadata: string | null
  videoUrl: string | null
  dramaImageConfigId: number | null
  dramaVideoConfigId: number | null
  dramaAudioConfigId: number | null
  contentCharCount?: number | null
  hasWrittenContent?: number | null
}

export type EpisodeStatsRow = {
  content: string | null
  scriptContent: string | null
  formattedScript: string | null
  contentBlobPath?: string | null
  scriptBlobPath?: string | null
  formattedScriptBlobPath?: string | null
  videoUrl: string | null
  metadata: string | null
}

export type NewEpisodeInput = {
  dramaId: number
  episodeNumber: number
  title: string
  createdAt: string
  updatedAt: string
  content?: string | null
  scriptContent?: string | null
  formattedScript?: string | null
  description?: string | null
  duration?: number
  status?: string
  dramaImageConfigId?: number | null
  dramaVideoConfigId?: number | null
  dramaAudioConfigId?: number | null
  metadata?: string | null
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

export function listSiblingEpisodesOrdered(dramaId: number): EpisodeRow[] {
  return db().select().from(schema.episodes)
    .where(eq(schema.episodes.dramaId, dramaId))
    .orderBy(asc(schema.episodes.episodeNumber))
    .all()
}

export function insertEpisode(input: NewEpisodeInput): DbRunResult {
  const res = db().insert(schema.episodes).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function findEpisodeById(id: number): EpisodeRow | null {
  const [row] = db().select().from(schema.episodes).where(eq(schema.episodes.id, id)).all()
  return row ?? null
}

export function updateEpisode(id: number, patch: Record<string, unknown>): void {
  db().update(schema.episodes).set(patch).where(eq(schema.episodes.id, id)).run()
}

export function countEpisodesFiltered(dramaId: number, isNovel: boolean, filter: EpisodeListFilter): number {
  const where = filterWhere(dramaId, isNovel, filter)
  const [{ count }] = db().select({ count: sql<number>`count(*)` }).from(schema.episodes).where(where).all()
  return Number(count) || 0
}

export function listEpisodesFiltered(args: {
  dramaId: number
  isNovel: boolean
  filter: EpisodeListFilter
  page: number
  pageSize: number
}): EpisodeListItemRow[] {
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
        WHEN LENGTH(coalesce(${schema.episodes.content}, '')) > 0 THEN LENGTH(${schema.episodes.content})
        ELSE COALESCE(CAST(json_extract(${schema.episodes.metadata}, '$.prose_char_count') AS INTEGER), 0)
      END`,
      hasWrittenContent: sql<number>`CASE WHEN trim(coalesce(${schema.episodes.content}, '')) != '' OR trim(coalesce(${schema.episodes.contentBlobPath}, '')) != '' THEN 1 ELSE 0 END`,
    })
      .from(schema.episodes)
      .where(where)
      .orderBy(asc(schema.episodes.episodeNumber))
      .limit(args.pageSize)
      .offset((args.page - 1) * args.pageSize)
      .all()
  }
  return db().select(baseColumns)
    .from(schema.episodes)
    .where(where)
    .orderBy(asc(schema.episodes.episodeNumber))
    .limit(args.pageSize)
    .offset((args.page - 1) * args.pageSize)
    .all()
}

export function findEpisodeByDramaAndNumber(dramaId: number, episodeNumber: number): EpisodeRow | null {
  const [row] = db().select().from(schema.episodes)
    .where(and(
      eq(schema.episodes.dramaId, dramaId),
      eq(schema.episodes.episodeNumber, episodeNumber),
      isNull(schema.episodes.deletedAt),
    ))
    .all()
  return row ?? null
}

export function listEpisodeStatsRows(dramaId: number): EpisodeStatsRow[] {
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
    .all()
}

export type EpisodeListAggregateStats = {
  total: number
  written: number
  totalChars: number
}

/** SQL-only stats for list/detail headers — never hydrates blob files. */
export function aggregateEpisodeListStats(dramaId: number, isNovel: boolean): EpisodeListAggregateStats {
  if (isNovel) {
    const rows = db().select({
      total: sql<number>`COUNT(*)`,
      written: sql<number>`SUM(CASE WHEN trim(coalesce(${schema.episodes.content}, '')) != '' OR trim(coalesce(${schema.episodes.contentBlobPath}, '')) != '' THEN 1 ELSE 0 END)`,
      totalChars: sql<number>`COALESCE(SUM(CASE
        WHEN LENGTH(coalesce(${schema.episodes.content}, '')) > 0 THEN LENGTH(${schema.episodes.content})
        ELSE COALESCE(CAST(json_extract(${schema.episodes.metadata}, '$.prose_char_count') AS INTEGER), 0)
      END), 0)`,
    })
      .from(schema.episodes)
      .where(dramaBaseWhere(dramaId))
      .all()
    const row = rows[0]
    return {
      total: Number(row?.total) || 0,
      written: Number(row?.written) || 0,
      totalChars: Number(row?.totalChars) || 0,
    }
  }

  const rows = db().select({
    videoUrl: schema.episodes.videoUrl,
    metadata: schema.episodes.metadata,
  })
    .from(schema.episodes)
    .where(dramaBaseWhere(dramaId))
    .all()

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

export function listEpisodeSceneLinks(episodeId: number) {
  return db().select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId)).all()
}

export function listScenesByIds(sceneIds: number[]): SceneRow[] {
  if (!sceneIds.length) return []
  return db().select().from(schema.scenes).where(inArray(schema.scenes.id, sceneIds)).all()
}

export function listEpisodeCharacterLinks(episodeId: number) {
  return db().select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId)).all()
}

export function listStoryboardIdsByEpisode(episodeId: number): number[] {
  return db().select({ id: schema.storyboards.id }).from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .map(r => r.id)
}

export function listAllStoryboardCharacterLinks() {
  return db().select().from(schema.storyboardCharacters).all()
}

export function listStoryboardsByEpisodeOrdered(episodeId: number): StoryboardRow[] {
  return db().select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()
}

export function listCharactersByDrama(dramaId: number): CharacterRow[] {
  return db().select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId)).all()
}

export function listAllCharacters(): CharacterRow[] {
  return db().select().from(schema.characters).all()
}

export function listScenesByDrama(dramaId: number): SceneRow[] {
  return db().select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId)).all()
}

export function listStoryboardsByEpisode(episodeId: number): StoryboardRow[] {
  return db().select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).all()
}

export function listVideoMergesByEpisode(episodeId: number): VideoMergeRow[] {
  return db().select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId)).all()
}

export function episodeCharacterLinkExists(episodeId: number, characterId: number): boolean {
  const rows = db().select().from(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
    .all()
  return rows.length > 0
}

export function insertEpisodeCharacterLink(episodeId: number, characterId: number, createdAt: string): void {
  db().insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt }).run()
}

export function episodeSceneLinkExists(episodeId: number, sceneId: number): boolean {
  const rows = db().select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
    .all()
  return rows.length > 0
}

export function insertEpisodeSceneLink(episodeId: number, sceneId: number, createdAt: string): void {
  db().insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt }).run()
}

export function listEpisodePropLinks(episodeId: number) {
  return db().select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId)).all()
}

export function insertEpisodePropLink(episodeId: number, propId: number, createdAt: string): void {
  db().insert(schema.episodeProps).values({ episodeId, propId, createdAt }).run()
}

export function episodePropLinkExists(episodeId: number, propId: number): boolean {
  const rows = db().select().from(schema.episodeProps)
    .where(and(
      eq(schema.episodeProps.episodeId, episodeId),
      eq(schema.episodeProps.propId, propId),
    ))
    .all()
  return rows.length > 0
}
