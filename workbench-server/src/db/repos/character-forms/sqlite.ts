import { eq, inArray } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { CharacterFormRow, DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export type NewCharacterFormInput = {
  dramaId: number
  characterId: number
  name: string
  appearance?: string | null
  description?: string | null
  prompt?: string | null
  sortOrder?: number | null
  createdAt: string
  updatedAt: string
}

export function findCharacterFormById(id: number): CharacterFormRow | null {
  const [row] = db().select().from(schema.characterForms).where(eq(schema.characterForms.id, id)).all()
  return row ?? null
}

export function listCharacterFormsByDrama(dramaId: number): CharacterFormRow[] {
  return db().select().from(schema.characterForms).where(eq(schema.characterForms.dramaId, dramaId)).all()
}

export function listActiveCharacterFormsByDrama(dramaId: number): CharacterFormRow[] {
  return listCharacterFormsByDrama(dramaId).filter(item => !item.deletedAt)
}

export function listCharacterFormsByCharacter(characterId: number): CharacterFormRow[] {
  return db().select().from(schema.characterForms).where(eq(schema.characterForms.characterId, characterId)).all()
    .filter(item => !item.deletedAt)
}

export function listCharacterFormsByIds(ids: number[]): CharacterFormRow[] {
  if (!ids.length) return []
  return db().select().from(schema.characterForms).where(inArray(schema.characterForms.id, ids)).all()
}

export function findActiveCharacterFormByName(characterId: number, name: string): CharacterFormRow | null {
  return listCharacterFormsByCharacter(characterId).find(item => item.name === name) ?? null
}

export function insertCharacterForm(input: NewCharacterFormInput): DbRunResult {
  const res = db().insert(schema.characterForms).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateCharacterForm(id: number, patch: Record<string, unknown>): void {
  db().update(schema.characterForms).set(patch).where(eq(schema.characterForms.id, id)).run()
}

export function softDeleteCharacterForm(id: number, deletedAt: string): void {
  db().update(schema.characterForms).set({ deletedAt }).where(eq(schema.characterForms.id, id)).run()
}
