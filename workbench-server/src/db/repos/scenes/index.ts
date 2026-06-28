import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, SceneRow } from '../types.js'
import type { NewSceneInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewSceneInput } from './sqlite.js'

export async function insertScene(input: NewSceneInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertScene(input) : sqlite.insertScene(input)
}

export async function findSceneById(id: number): Promise<SceneRow | null> {
  return isMysqlDriver() ? mysql.findSceneById(id) : sqlite.findSceneById(id)
}

export async function updateScene(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateScene(id, patch)
  sqlite.updateScene(id, patch)
}

export async function deleteScene(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteScene(id)
  sqlite.deleteScene(id)
}

export async function listActiveScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  return isMysqlDriver() ? mysql.listActiveScenesByDrama(dramaId) : sqlite.listActiveScenesByDrama(dramaId)
}

export async function findActiveSceneByLocationTime(dramaId: number, location: string, time: string): Promise<SceneRow | null> {
  return isMysqlDriver()
    ? mysql.findActiveSceneByLocationTime(dramaId, location, time)
    : sqlite.findActiveSceneByLocationTime(dramaId, location, time)
}
