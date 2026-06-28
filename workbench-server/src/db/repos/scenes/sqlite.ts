import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, SceneRow } from '../types.js'

const db = () => getSqliteDb()

export type NewSceneInput = {
  dramaId: number
  episodeId?: number | null
  location: string
  time: string
  prompt: string
  storyboardCount?: number
  status?: string
  createdAt: string
  updatedAt: string
}

export function insertScene(input: NewSceneInput): DbRunResult {
  const res = db().insert(schema.scenes).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function findSceneById(id: number): SceneRow | null {
  const [row] = db().select().from(schema.scenes).where(eq(schema.scenes.id, id)).all()
  return row ?? null
}

export function updateScene(id: number, patch: Record<string, unknown>): void {
  db().update(schema.scenes).set(patch).where(eq(schema.scenes.id, id)).run()
}

export function deleteScene(id: number): void {
  db().delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
}

export function listActiveScenesByDrama(dramaId: number): SceneRow[] {
  return listScenesByDrama(dramaId).filter(item => !item.deletedAt)
}

export function findActiveSceneByLocationTime(dramaId: number, location: string, time: string): SceneRow | null {
  return listActiveScenesByDrama(dramaId)
    .find(item => item.location === location && item.time === time) ?? null
}

function listScenesByDrama(dramaId: number): SceneRow[] {
  return db().select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId)).all()
}
