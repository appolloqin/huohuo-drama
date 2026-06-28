import { isMysqlDriver } from '../../driver.js'
import type { AppSettingRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function getAppSetting(key: string): Promise<AppSettingRow | null> {
  return isMysqlDriver() ? mysql.getAppSetting(key) : sqlite.getAppSetting(key)
}

export async function upsertAppSetting(key: string, value: string, updatedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.upsertAppSetting(key, value, updatedAt)
  sqlite.upsertAppSetting(key, value, updatedAt)
}
