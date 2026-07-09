import { eq, inArray } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, PropRow } from '../types.js'
import type { NewPropInput } from './sqlite.js'

const db = () => getMysqlDb()

export async function findPropById(id: number): Promise<PropRow | null> {
  const [row] = await db().select().from(schema.props).where(eq(schema.props.id, id)).limit(1)
  return row ?? null
}

export async function listPropsByDrama(dramaId: number): Promise<PropRow[]> {
  return db().select().from(schema.props).where(eq(schema.props.dramaId, dramaId))
}

export async function listActivePropsByDrama(dramaId: number): Promise<PropRow[]> {
  const rows = await listPropsByDrama(dramaId)
  return rows.filter(item => !item.deletedAt)
}

export async function listPropsByIds(ids: number[]): Promise<PropRow[]> {
  if (!ids.length) return []
  return db().select().from(schema.props).where(inArray(schema.props.id, ids))
}

export async function findActivePropByName(dramaId: number, name: string): Promise<PropRow | null> {
  const rows = await listActivePropsByDrama(dramaId)
  return rows.find(item => item.name === name) ?? null
}

export async function insertProp(input: NewPropInput): Promise<DbRunResult> {
  const res = await db().insert(schema.props).values(input)
  const insertId = Number(res[0]?.insertId ?? 0)
  return { lastInsertRowid: insertId, changes: res[0]?.affectedRows }
}

export async function updateProp(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.props).set(patch).where(eq(schema.props.id, id))
}

export async function softDeleteProp(id: number, deletedAt: string): Promise<void> {
  await db().update(schema.props).set({ deletedAt }).where(eq(schema.props.id, id))
}
