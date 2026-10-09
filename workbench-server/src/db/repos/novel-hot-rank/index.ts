import { isMysqlDriver } from '../../driver.js'
import type { NovelHotRankItemRow } from '../types.js'
import type { NovelHotRankItemInsert } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NovelHotRankItemInsert } from './sqlite.js'

export async function listByPlatform(platform: string): Promise<NovelHotRankItemRow[]> {
  return isMysqlDriver() ? mysql.listByPlatform(platform) : sqlite.listByPlatform(platform)
}

export async function deleteByPlatform(platform: string): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteByPlatform(platform)
  sqlite.deleteByPlatform(platform)
}

export async function upsertMany(rows: NovelHotRankItemInsert[]): Promise<void> {
  if (isMysqlDriver()) return mysql.upsertMany(rows)
  sqlite.upsertMany(rows)
}

export async function replacePlatform(platform: string, rows: NovelHotRankItemInsert[]): Promise<void> {
  if (isMysqlDriver()) return mysql.replacePlatform(platform, rows)
  sqlite.replacePlatform(platform, rows)
}
