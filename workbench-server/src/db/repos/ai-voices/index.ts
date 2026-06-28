import { isMysqlDriver } from '../../driver.js'
import type { AiVoiceRow } from '../types.js'
import type { NewAiVoiceInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewAiVoiceInput } from './sqlite.js'

export async function listAiVoicesByProvider(provider: string): Promise<AiVoiceRow[]> {
  return isMysqlDriver()
    ? mysql.listAiVoicesByProvider(provider)
    : sqlite.listAiVoicesByProvider(provider)
}

export async function deleteAiVoicesByProvider(provider: string): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteAiVoicesByProvider(provider)
  sqlite.deleteAiVoicesByProvider(provider)
}

export async function insertAiVoices(rows: NewAiVoiceInput[]): Promise<void> {
  if (isMysqlDriver()) return mysql.insertAiVoices(rows)
  sqlite.insertAiVoices(rows)
}
