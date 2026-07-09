import { eq, inArray, isNull } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { CharacterFormRow, DbRunResult } from '../types.js'
import type { NewCharacterFormInput } from './sqlite.js'

const db = () => getMysqlDb()

export async function findCharacterFormById(id: number): Promise<CharacterFormRow | null> {
  const [row] = await db().select().from(schema.characterForms).where(eq(schema.characterForms.id, id)).limit(1)
  return row ?? null
}

export async function listCharacterFormsByDrama(dramaId: number): Promise<CharacterFormRow[]> {
  return db().select().from(schema.characterForms).where(eq(schema.characterForms.dramaId, dramaId))
}

export async function listActiveCharacterFormsByDrama(dramaId: number): Promise<CharacterFormRow[]> {
  return db().select().from(schema.characterForms).where(
    eq(schema.characterForms.dramaId, dramaId),
  ).then(rows => rows.filter(item => !item.deletedAt))
}

export async function listCharacterFormsByCharacter(characterId: number): Promise<CharacterFormRow[]> {
  const rows = await db().select().from(schema.characterForms).where(eq(schema.characterForms.characterId, characterId))
  return rows.filter(item => !item.deletedAt)
}

export async function listCharacterFormsByIds(ids: number[]): Promise<CharacterFormRow[]> {
  if (!ids.length) return []
  return db().select().from(schema.characterForms).where(inArray(schema.characterForms.id, ids))
}

export async function findActiveCharacterFormByName(characterId: number, name: string): Promise<CharacterFormRow | null> {
  const rows = await listCharacterFormsByCharacter(characterId)
  return rows.find(item => item.name === name) ?? null
}

export async function insertCharacterForm(input: NewCharacterFormInput): Promise<DbRunResult> {
  const res = await db().insert(schema.characterForms).values(input)
  const insertId = Number(res[0]?.insertId ?? 0)
  return { lastInsertRowid: insertId, changes: res[0]?.affectedRows }
}

export async function updateCharacterForm(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.characterForms).set(patch).where(eq(schema.characterForms.id, id))
}

export async function softDeleteCharacterForm(id: number, deletedAt: string): Promise<void> {
  await db().update(schema.characterForms).set({ deletedAt }).where(eq(schema.characterForms.id, id))
}
