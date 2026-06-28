import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AiServiceConfigRow, AiServiceProviderRow, DbRunResult } from '../types.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

function normalizeConfigRow(row: typeof schema.aiServiceConfigs.$inferSelect): AiServiceConfigRow {
  return {
    ...row,
    isActive: row.isActive == null ? null : Boolean(row.isActive),
    isDefault: row.isDefault == null ? null : Boolean(row.isDefault),
  }
}

function normalizeProviderRow(row: typeof schema.aiServiceProviders.$inferSelect): AiServiceProviderRow {
  return {
    ...row,
    isActive: row.isActive == null ? null : Boolean(row.isActive),
  }
}

export async function listAllServiceConfigs(): Promise<AiServiceConfigRow[]> {
  const rows = await db().select().from(schema.aiServiceConfigs)
  return rows.map(normalizeConfigRow)
}

export async function listServiceConfigsByType(serviceType: string): Promise<AiServiceConfigRow[]> {
  const rows = await db().select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
  return rows.map(normalizeConfigRow)
}

export async function findServiceConfigById(id: number): Promise<AiServiceConfigRow | null> {
  const rows = await db().select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  return rows[0] ? normalizeConfigRow(rows[0]) : null
}

export async function findServiceConfigByTypeAndProvider(serviceType: string, provider: string): Promise<AiServiceConfigRow | null> {
  const rows = await listServiceConfigsByType(serviceType)
  return rows.find(row => row.provider === provider) ?? null
}

export async function insertServiceConfig(input: typeof schema.aiServiceConfigs.$inferInsert): Promise<DbRunResult> {
  const result = await db().insert(schema.aiServiceConfigs).values({
    ...input,
    isActive: input.isActive == null ? input.isActive : (input.isActive ? 1 : 0),
    isDefault: input.isDefault == null ? input.isDefault : (input.isDefault ? 1 : 0),
  })
  return normalizeRun(result)
}

export async function updateServiceConfig(id: number, patch: Record<string, unknown>): Promise<void> {
  const normalized = { ...patch }
  if ('isActive' in normalized && typeof normalized.isActive === 'boolean') {
    normalized.isActive = normalized.isActive ? 1 : 0
  }
  if ('isDefault' in normalized && typeof normalized.isDefault === 'boolean') {
    normalized.isDefault = normalized.isDefault ? 1 : 0
  }
  await db().update(schema.aiServiceConfigs).set(normalized).where(eq(schema.aiServiceConfigs.id, id))
}

export async function deleteServiceConfig(id: number): Promise<void> {
  await db().delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
}

export async function listServiceProviders(): Promise<AiServiceProviderRow[]> {
  const rows = await db().select().from(schema.aiServiceProviders)
  return rows.map(normalizeProviderRow)
}
