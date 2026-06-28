import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, StoryboardRow } from '../types.js'
import type { NewStoryboardInput } from './sqlite.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function insertStoryboard(input: NewStoryboardInput): Promise<DbRunResult> {
  const result = await db().insert(schema.storyboards).values(input)
  return normalizeRun(result)
}

export async function findStoryboardById(id: number): Promise<StoryboardRow | null> {
  const rows = await db().select().from(schema.storyboards).where(eq(schema.storyboards.id, id))
  return rows[0] ?? null
}

export async function updateStoryboard(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.storyboards).set(patch).where(eq(schema.storyboards.id, id))
}

export async function deleteStoryboard(id: number): Promise<void> {
  await db().delete(schema.storyboards).where(eq(schema.storyboards.id, id))
}

export async function listStoryboardCharacterIds(storyboardId: number): Promise<number[]> {
  const rows = await db().select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
  return rows.map(link => link.characterId)
}

export async function replaceStoryboardCharacters(storyboardId: number, characterIds: number[]): Promise<void> {
  await db().delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
  const uniqueIds = [...new Set(characterIds.filter(Boolean))]
  for (const characterId of uniqueIds) {
    await db().insert(schema.storyboardCharacters).values({ storyboardId, characterId })
  }
}

export async function deleteStoryboardCharactersByStoryboard(storyboardId: number): Promise<void> {
  await db().delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
}

export async function listStoryboardIdsByEpisode(episodeId: number): Promise<number[]> {
  const rows = await db().select({ id: schema.storyboards.id }).from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  return rows.map(row => row.id)
}

export async function listActiveStoryboardsByEpisode(episodeId: number): Promise<StoryboardRow[]> {
  const rows = await db().select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  return rows.filter(item => !item.deletedAt)
}

export async function listStoryboardsByIds(ids: number[]): Promise<StoryboardRow[]> {
  if (!ids.length) return []
  return db().select().from(schema.storyboards).where(inArray(schema.storyboards.id, ids))
}

export async function listStoryboardCharacterLinksForIds(storyboardIds: number[]) {
  if (!storyboardIds.length) return []
  return db().select().from(schema.storyboardCharacters)
    .where(inArray(schema.storyboardCharacters.storyboardId, storyboardIds))
}

export async function updateStoryboardsByEpisode(episodeId: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.storyboards).set(patch).where(eq(schema.storyboards.episodeId, episodeId))
}

export async function listStoryboardsByEpisodeIdsOrdered(episodeIds: number[], limit = 16): Promise<StoryboardRow[]> {
  if (!episodeIds.length) return []
  return db().select().from(schema.storyboards)
    .where(and(inArray(schema.storyboards.episodeId, episodeIds), isNull(schema.storyboards.deletedAt)))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .limit(limit)
}

export async function deleteAllStoryboardsForEpisode(episodeId: number): Promise<void> {
  const ids = await listStoryboardIdsByEpisode(episodeId)
  for (const storyboardId of ids) {
    await deleteStoryboardCharactersByStoryboard(storyboardId)
  }
  await db().delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
}
