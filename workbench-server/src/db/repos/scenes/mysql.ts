import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, SceneRow } from '../types.js'
import type { NewSceneInput } from './sqlite.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function insertScene(input: NewSceneInput): Promise<DbRunResult> {
  const result = await db().insert(schema.scenes).values(input)
  return normalizeRun(result)
}

export async function findSceneById(id: number): Promise<SceneRow | null> {
  const rows = await db().select().from(schema.scenes).where(eq(schema.scenes.id, id))
  return rows[0] ?? null
}

export async function updateScene(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.scenes).set(patch).where(eq(schema.scenes.id, id))
}

export async function deleteScene(id: number): Promise<void> {
  await db().delete(schema.scenes).where(eq(schema.scenes.id, id))
}

export async function listActiveScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  const rows = await db().select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId))
  return rows.filter(item => !item.deletedAt)
}

export async function findActiveSceneByLocationTime(dramaId: number, location: string, time: string): Promise<SceneRow | null> {
  const rows = await listActiveScenesByDrama(dramaId)
  return rows.find(item => item.location === location && item.time === time) ?? null
}
