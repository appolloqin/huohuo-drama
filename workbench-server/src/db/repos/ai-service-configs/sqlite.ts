import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { AiServiceConfigRow, AiServiceProviderRow, DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export function listAllServiceConfigs(): AiServiceConfigRow[] {
  return db().select().from(schema.aiServiceConfigs).all()
}

export function listServiceConfigsByType(serviceType: string): AiServiceConfigRow[] {
  return db().select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
    .all()
}

export function findServiceConfigById(id: number): AiServiceConfigRow | null {
  const [row] = db().select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).all()
  return row ?? null
}

export function findServiceConfigByTypeAndProvider(serviceType: string, provider: string): AiServiceConfigRow | null {
  return listServiceConfigsByType(serviceType).find(row => row.provider === provider) ?? null
}

export function insertServiceConfig(input: typeof schema.aiServiceConfigs.$inferInsert): DbRunResult {
  const res = db().insert(schema.aiServiceConfigs).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateServiceConfig(id: number, patch: Record<string, unknown>): void {
  db().update(schema.aiServiceConfigs).set(patch).where(eq(schema.aiServiceConfigs.id, id)).run()
}

export function deleteServiceConfig(id: number): void {
  db().delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).run()
}

export function listServiceProviders(): AiServiceProviderRow[] {
  return db().select().from(schema.aiServiceProviders).all()
}
