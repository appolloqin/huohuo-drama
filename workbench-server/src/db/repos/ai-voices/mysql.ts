import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AiVoiceRow } from '../types.js'
import type { NewAiVoiceInput } from './sqlite.js'

const db = () => getMysqlDb()

export async function listAiVoicesByProvider(provider: string): Promise<AiVoiceRow[]> {
  return db().select().from(schema.aiVoices).where(eq(schema.aiVoices.provider, provider))
}

export async function deleteAiVoicesByProvider(provider: string): Promise<void> {
  await db().delete(schema.aiVoices).where(eq(schema.aiVoices.provider, provider))
}

export async function insertAiVoices(rows: NewAiVoiceInput[]): Promise<void> {
  if (!rows.length) return
  await db().insert(schema.aiVoices).values(rows)
}
