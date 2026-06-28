import { isMysqlDriver } from '../../driver.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function saveCharactersBatch(dramaId: number, rows: Record<string, unknown>[], timestamp: string): Promise<void> {
  if (isMysqlDriver()) return mysql.saveCharactersBatch(dramaId, rows, timestamp)
  sqlite.saveCharactersBatch(dramaId, rows, timestamp)
}

export async function saveEpisodesBatch(dramaId: number, rows: Record<string, unknown>[], timestamp: string): Promise<void> {
  if (isMysqlDriver()) return mysql.saveEpisodesBatch(dramaId, rows, timestamp)
  sqlite.saveEpisodesBatch(dramaId, rows, timestamp)
}
