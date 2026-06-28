import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult } from '../types.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function listAllPresets() {
  return db().select().from(schema.aiPresetConfigs).orderBy(schema.aiPresetConfigs.id)
}

export async function findPresetByKey(presetKey: string) {
  const rows = await db().select().from(schema.aiPresetConfigs).where(eq(schema.aiPresetConfigs.presetKey, presetKey))
  return rows[0] ?? null
}

export async function upsertPreset(input: {
  presetKey: string
  serviceType?: string | null
  provider?: string | null
  baseUrl?: string | null
  apiKey?: string | null
  model?: string | null
  label?: string | null
  priority?: number | null
  isActive?: boolean | null
  createdAt: string
  updatedAt: string
}): Promise<DbRunResult> {
  const existing = await findPresetByKey(input.presetKey)
  // MySQL stores is_active as INT (0/1), not boolean — match the column type.
  const activeInt = input.isActive === false ? 0 : 1
  if (existing) {
    await db().update(schema.aiPresetConfigs)
      .set({
        serviceType: input.serviceType ?? null,
        provider: input.provider ?? null,
        baseUrl: input.baseUrl ?? null,
        apiKey: input.apiKey ?? null,
        model: input.model ?? null,
        label: input.label ?? null,
        priority: input.priority ?? 0,
        isActive: activeInt,
        updatedAt: input.updatedAt,
      })
      .where(eq(schema.aiPresetConfigs.presetKey, input.presetKey))
    return { lastInsertRowid: Number(existing.id), changes: 1 }
  }
  const result = await db().insert(schema.aiPresetConfigs).values({
    presetKey: input.presetKey,
    serviceType: input.serviceType ?? null,
    provider: input.provider ?? null,
    baseUrl: input.baseUrl ?? null,
    apiKey: input.apiKey ?? null,
    model: input.model ?? null,
    label: input.label ?? null,
    priority: input.priority ?? 0,
    isActive: activeInt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
  return normalizeRun(result)
}