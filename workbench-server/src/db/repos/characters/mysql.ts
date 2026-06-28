import { eq, inArray } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { CharacterRow, DbRunResult } from '../types.js'
import type { NewCharacterInput } from './sqlite.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function findCharacterById(id: number): Promise<CharacterRow | null> {
  const rows = await db().select().from(schema.characters).where(eq(schema.characters.id, id))
  return rows[0] ?? null
}

export async function listCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return db().select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId))
}

export async function listActiveCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  const rows = await listCharactersByDrama(dramaId)
  return rows.filter(item => !item.deletedAt)
}

export async function findActiveCharacterByName(dramaId: number, name: string): Promise<CharacterRow | null> {
  const rows = await listActiveCharactersByDrama(dramaId)
  return rows.find(item => item.name === name) ?? null
}

export async function listCharactersByIds(ids: number[]): Promise<CharacterRow[]> {
  if (!ids.length) return []
  return db().select().from(schema.characters).where(inArray(schema.characters.id, ids))
}

export async function insertCharacter(input: NewCharacterInput): Promise<DbRunResult> {
  const result = await db().insert(schema.characters).values(input)
  return normalizeRun(result)
}

export async function updateCharacter(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.characters).set(patch).where(eq(schema.characters.id, id))
}

export async function softDeleteCharacter(id: number, deletedAt: string): Promise<void> {
  await db().update(schema.characters).set({ deletedAt }).where(eq(schema.characters.id, id))
}
