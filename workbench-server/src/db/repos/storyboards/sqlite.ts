import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, StoryboardRow } from '../types.js'

const db = () => getSqliteDb()

export type NewStoryboardInput = {
  episodeId: number
  storyboardNumber: number
  title?: string | null
  description?: string | null
  action?: string | null
  dialogue?: string | null
  sceneId?: number | null
  duration?: number
  shotType?: string | null
  angle?: string | null
  movement?: string | null
  location?: string | null
  time?: string | null
  result?: string | null
  atmosphere?: string | null
  imagePrompt?: string | null
  videoPrompt?: string | null
  bgmPrompt?: string | null
  soundEffect?: string | null
  createdAt: string
  updatedAt: string
}

export function insertStoryboard(input: NewStoryboardInput): DbRunResult {
  const res = db().insert(schema.storyboards).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function findStoryboardById(id: number): StoryboardRow | null {
  const [row] = db().select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).all()
  return row ?? null
}

export function updateStoryboard(id: number, patch: Record<string, unknown>): void {
  db().update(schema.storyboards).set(patch).where(eq(schema.storyboards.id, id)).run()
}

export function deleteStoryboard(id: number): void {
  db().delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
}

export function listStoryboardCharacterIds(storyboardId: number): number[] {
  return db().select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    .all()
    .map(link => link.characterId)
}

export function replaceStoryboardCharacters(storyboardId: number, characterIds: number[]): void {
  db().delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).run()
  const uniqueIds = [...new Set(characterIds.filter(Boolean))]
  for (const characterId of uniqueIds) {
    db().insert(schema.storyboardCharacters).values({ storyboardId, characterId }).run()
  }
}

export function deleteStoryboardCharactersByStoryboard(storyboardId: number): void {
  db().delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId)).run()
}

export function listStoryboardIdsByEpisode(episodeId: number): number[] {
  return db().select({ id: schema.storyboards.id }).from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .map(row => row.id)
}

export function listActiveStoryboardsByEpisode(episodeId: number): StoryboardRow[] {
  return db().select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .all()
    .filter(item => !item.deletedAt)
}

export function listStoryboardsByIds(ids: number[]): StoryboardRow[] {
  if (!ids.length) return []
  return db().select().from(schema.storyboards).where(inArray(schema.storyboards.id, ids)).all()
}

export function listStoryboardCharacterLinksForIds(storyboardIds: number[]) {
  if (!storyboardIds.length) return []
  return db().select().from(schema.storyboardCharacters)
    .where(inArray(schema.storyboardCharacters.storyboardId, storyboardIds))
    .all()
}

export function updateStoryboardsByEpisode(episodeId: number, patch: Record<string, unknown>): void {
  db().update(schema.storyboards).set(patch).where(eq(schema.storyboards.episodeId, episodeId)).run()
}

export function listStoryboardsByEpisodeIdsOrdered(episodeIds: number[], limit = 16): StoryboardRow[] {
  if (!episodeIds.length) return []
  return db().select().from(schema.storyboards)
    .where(and(inArray(schema.storyboards.episodeId, episodeIds), isNull(schema.storyboards.deletedAt)))
    .orderBy(asc(schema.storyboards.storyboardNumber))
    .limit(limit)
    .all()
}

export function deleteAllStoryboardsForEpisode(episodeId: number): void {
  const ids = listStoryboardIdsByEpisode(episodeId)
  for (const storyboardId of ids) {
    deleteStoryboardCharactersByStoryboard(storyboardId)
  }
  db().delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()
}
