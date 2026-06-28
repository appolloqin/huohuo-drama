import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'

const db = () => getSqliteDb()

export function getAppSetting(key: string) {
  const [row] = db().select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).all()
  return row ?? null
}

export function upsertAppSetting(key: string, value: string, updatedAt: string): void {
  const existing = getAppSetting(key)
  if (existing) {
    db().update(schema.appSettings).set({ value, updatedAt }).where(eq(schema.appSettings.key, key)).run()
  } else {
    db().insert(schema.appSettings).values({ key, value, updatedAt }).run()
  }
}
