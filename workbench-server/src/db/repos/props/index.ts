import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, PropRow } from '../types.js'
import type { NewPropInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewPropInput } from './sqlite.js'

export async function findPropById(id: number): Promise<PropRow | null> {
  return isMysqlDriver() ? mysql.findPropById(id) : sqlite.findPropById(id)
}

export async function listPropsByDrama(dramaId: number): Promise<PropRow[]> {
  return isMysqlDriver() ? mysql.listPropsByDrama(dramaId) : sqlite.listPropsByDrama(dramaId)
}

export async function listActivePropsByDrama(dramaId: number): Promise<PropRow[]> {
  return isMysqlDriver() ? mysql.listActivePropsByDrama(dramaId) : sqlite.listActivePropsByDrama(dramaId)
}

export async function listPropsByIds(ids: number[]): Promise<PropRow[]> {
  return isMysqlDriver() ? mysql.listPropsByIds(ids) : sqlite.listPropsByIds(ids)
}

export async function findActivePropByName(dramaId: number, name: string): Promise<PropRow | null> {
  return isMysqlDriver() ? mysql.findActivePropByName(dramaId, name) : sqlite.findActivePropByName(dramaId, name)
}

export async function insertProp(input: NewPropInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertProp(input) : sqlite.insertProp(input)
}

export async function updateProp(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateProp(id, patch)
  sqlite.updateProp(id, patch)
}

export async function softDeleteProp(id: number, deletedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.softDeleteProp(id, deletedAt)
  sqlite.softDeleteProp(id, deletedAt)
}
