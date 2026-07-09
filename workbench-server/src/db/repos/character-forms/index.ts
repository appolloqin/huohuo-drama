import { isMysqlDriver } from '../../driver.js'
import type { CharacterFormRow, DbRunResult } from '../types.js'
import type { NewCharacterFormInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewCharacterFormInput } from './sqlite.js'

export async function findCharacterFormById(id: number): Promise<CharacterFormRow | null> {
  return isMysqlDriver() ? mysql.findCharacterFormById(id) : sqlite.findCharacterFormById(id)
}

export async function listCharacterFormsByDrama(dramaId: number): Promise<CharacterFormRow[]> {
  return isMysqlDriver() ? mysql.listCharacterFormsByDrama(dramaId) : sqlite.listCharacterFormsByDrama(dramaId)
}

export async function listActiveCharacterFormsByDrama(dramaId: number): Promise<CharacterFormRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveCharacterFormsByDrama(dramaId)
    : sqlite.listActiveCharacterFormsByDrama(dramaId)
}

export async function listCharacterFormsByCharacter(characterId: number): Promise<CharacterFormRow[]> {
  return isMysqlDriver()
    ? mysql.listCharacterFormsByCharacter(characterId)
    : sqlite.listCharacterFormsByCharacter(characterId)
}

export async function listCharacterFormsByIds(ids: number[]): Promise<CharacterFormRow[]> {
  return isMysqlDriver() ? mysql.listCharacterFormsByIds(ids) : sqlite.listCharacterFormsByIds(ids)
}

export async function findActiveCharacterFormByName(characterId: number, name: string): Promise<CharacterFormRow | null> {
  return isMysqlDriver()
    ? mysql.findActiveCharacterFormByName(characterId, name)
    : sqlite.findActiveCharacterFormByName(characterId, name)
}

export async function insertCharacterForm(input: NewCharacterFormInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertCharacterForm(input) : sqlite.insertCharacterForm(input)
}

export async function updateCharacterForm(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateCharacterForm(id, patch)
  sqlite.updateCharacterForm(id, patch)
}

export async function softDeleteCharacterForm(id: number, deletedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.softDeleteCharacterForm(id, deletedAt)
  sqlite.softDeleteCharacterForm(id, deletedAt)
}
