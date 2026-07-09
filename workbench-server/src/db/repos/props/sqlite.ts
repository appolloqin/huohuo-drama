import { eq, inArray } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, PropRow } from '../types.js'

const db = () => getSqliteDb()

export type NewPropInput = {
  dramaId: number
  characterId?: number | null
  characterFormId?: number | null
  name: string
  type?: string | null
  description?: string | null
  prompt?: string | null
  createdAt: string
  updatedAt: string
}

export function findPropById(id: number): PropRow | null {
  const [row] = db().select().from(schema.props).where(eq(schema.props.id, id)).all()
  return row ?? null
}

export function listPropsByDrama(dramaId: number): PropRow[] {
  return db().select().from(schema.props).where(eq(schema.props.dramaId, dramaId)).all()
}

export function listActivePropsByDrama(dramaId: number): PropRow[] {
  return listPropsByDrama(dramaId).filter(item => !item.deletedAt)
}

export function listPropsByIds(ids: number[]): PropRow[] {
  if (!ids.length) return []
  return db().select().from(schema.props).where(inArray(schema.props.id, ids)).all()
}

export function findActivePropByName(dramaId: number, name: string): PropRow | null {
  return listActivePropsByDrama(dramaId).find(item => item.name === name) ?? null
}

export function insertProp(input: NewPropInput): DbRunResult {
  const res = db().insert(schema.props).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateProp(id: number, patch: Record<string, unknown>): void {
  db().update(schema.props).set(patch).where(eq(schema.props.id, id)).run()
}

export function softDeleteProp(id: number, deletedAt: string): void {
  db().update(schema.props).set({ deletedAt }).where(eq(schema.props.id, id)).run()
}
