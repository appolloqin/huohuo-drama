import { isMysqlDriver } from '../../driver.js'
import type { CharacterRow, DbRunResult } from '../types.js'
import type { NewCharacterInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewCharacterInput } from './sqlite.js'

export async function findCharacterById(id: number): Promise<CharacterRow | null> {
  return isMysqlDriver() ? mysql.findCharacterById(id) : sqlite.findCharacterById(id)
}

export async function listCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return isMysqlDriver() ? mysql.listCharactersByDrama(dramaId) : sqlite.listCharactersByDrama(dramaId)
}

export async function listCharactersByIds(ids: number[]): Promise<CharacterRow[]> {
  return isMysqlDriver() ? mysql.listCharactersByIds(ids) : sqlite.listCharactersByIds(ids)
}

export async function listActiveCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveCharactersByDrama(dramaId)
    : sqlite.listActiveCharactersByDrama(dramaId)
}

export async function findActiveCharacterByName(dramaId: number, name: string): Promise<CharacterRow | null> {
  return isMysqlDriver()
    ? mysql.findActiveCharacterByName(dramaId, name)
    : sqlite.findActiveCharacterByName(dramaId, name)
}

export async function insertCharacter(input: NewCharacterInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertCharacter(input) : sqlite.insertCharacter(input)
}

export async function updateCharacter(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateCharacter(id, patch)
  sqlite.updateCharacter(id, patch)
}

export async function softDeleteCharacter(id: number, deletedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.softDeleteCharacter(id, deletedAt)
  sqlite.softDeleteCharacter(id, deletedAt)
}
