import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { AiVoiceRow } from '../types.js'

const db = () => getSqliteDb()

export type NewAiVoiceInput = typeof schema.aiVoices.$inferInsert

export function listAiVoicesByProvider(provider: string): AiVoiceRow[] {
  return db().select().from(schema.aiVoices).where(eq(schema.aiVoices.provider, provider)).all()
}

export function deleteAiVoicesByProvider(provider: string): void {
  db().delete(schema.aiVoices).where(eq(schema.aiVoices.provider, provider)).run()
}

export function insertAiVoices(rows: NewAiVoiceInput[]): void {
  if (!rows.length) return
  db().insert(schema.aiVoices).values(rows).run()
}
