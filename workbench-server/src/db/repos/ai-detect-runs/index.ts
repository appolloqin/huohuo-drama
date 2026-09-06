import { isMysqlDriver } from '../../driver.js'
import type { AiDetectRunCacheKey, AiDetectRunInput, AiDetectRunRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { AiDetectRunCacheKey, AiDetectRunInput, AiDetectRunRow } from '../types.js'

export async function upsertRun(input: AiDetectRunInput): Promise<number> {
  return isMysqlDriver() ? mysql.upsertRun(input) : sqlite.upsertRun(input)
}

export async function findCacheableRun(key: AiDetectRunCacheKey): Promise<AiDetectRunRow | null> {
  return isMysqlDriver() ? mysql.findCacheableRun(key) : sqlite.findCacheableRun(key)
}

export async function bumpCacheHit(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.bumpCacheHit(id)
  sqlite.bumpCacheHit(id)
}
