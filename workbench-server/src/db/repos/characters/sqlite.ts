import { eq, inArray } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { CharacterRow, DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export type NewCharacterInput = {
  dramaId: number
  name: string
  role?: string | null
  description?: string | null
  appearance?: string | null
  personality?: string | null
  voiceId?: string | null
  sortOrder?: number | null
  createdAt: string
  updatedAt: string
}

export function findCharacterById(id: number): CharacterRow | null {
  const [row] = db().select().from(schema.characters).where(eq(schema.characters.id, id)).all()
  return row ?? null
}

export function listCharactersByDrama(dramaId: number): CharacterRow[] {
  return db().select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId)).all()
}

export function listActiveCharactersByDrama(dramaId: number): CharacterRow[] {
  return listCharactersByDrama(dramaId).filter(item => !item.deletedAt)
}

export function findActiveCharacterByName(dramaId: number, name: string): CharacterRow | null {
  return listActiveCharactersByDrama(dramaId).find(item => item.name === name) ?? null
}

export function listCharactersByIds(ids: number[]): CharacterRow[] {
  if (!ids.length) return []
  return db().select().from(schema.characters).where(inArray(schema.characters.id, ids)).all()
}

export function insertCharacter(input: NewCharacterInput): DbRunResult {
  const res = db().insert(schema.characters).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateCharacter(id: number, patch: Record<string, unknown>): void {
  db().update(schema.characters).set(patch).where(eq(schema.characters.id, id)).run()
}

export function softDeleteCharacter(id: number, deletedAt: string): void {
  db().update(schema.characters).set({ deletedAt }).where(eq(schema.characters.id, id)).run()
}
