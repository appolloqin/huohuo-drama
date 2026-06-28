import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AppSettingRow } from '../types.js'

const db = () => getMysqlDb()

export async function getAppSetting(key: string): Promise<AppSettingRow | null> {
  const rows = await db().select().from(schema.appSettings).where(eq(schema.appSettings.key, key))
  return rows[0] ?? null
}

export async function upsertAppSetting(key: string, value: string, updatedAt: string): Promise<void> {
  const existing = await getAppSetting(key)
  if (existing) {
    await db().update(schema.appSettings).set({ value, updatedAt }).where(eq(schema.appSettings.key, key))
  } else {
    await db().insert(schema.appSettings).values({ key, value, updatedAt })
  }
}
