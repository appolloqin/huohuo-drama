import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export function listAllPresets() {
  return db().select().from(schema.aiPresetConfigs).orderBy(schema.aiPresetConfigs.id).all()
}

export function findPresetByKey(presetKey: string) {
  const row = db().select().from(schema.aiPresetConfigs).where(eq(schema.aiPresetConfigs.presetKey, presetKey)).get()
  return row ?? null
}

export function upsertPreset(input: {
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
}): DbRunResult {
  const existing = findPresetByKey(input.presetKey)
  if (existing) {
    db().update(schema.aiPresetConfigs)
      .set({
        serviceType: input.serviceType ?? null,
        provider: input.provider ?? null,
        baseUrl: input.baseUrl ?? null,
        apiKey: input.apiKey ?? null,
        model: input.model ?? null,
        label: input.label ?? null,
        priority: input.priority ?? 0,
        isActive: input.isActive ?? true,
        updatedAt: input.updatedAt,
      })
      .where(eq(schema.aiPresetConfigs.presetKey, input.presetKey))
      .run()
    return { lastInsertRowid: Number(existing.id), changes: 1 }
  }
  const res = db().insert(schema.aiPresetConfigs).values({
    presetKey: input.presetKey,
    serviceType: input.serviceType ?? null,
    provider: input.provider ?? null,
    baseUrl: input.baseUrl ?? null,
    apiKey: input.apiKey ?? null,
    model: input.model ?? null,
    label: input.label ?? null,
    priority: input.priority ?? 0,
    isActive: input.isActive ?? true,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}